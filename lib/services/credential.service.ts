import { prisma } from "@/lib/prisma";
import { getUserDivisionIds, getUserRoleInDivision } from "@/lib/auth";
import { encryptToString, decryptFromString } from "@/lib/crypto";
import { toSlug } from "@/lib/slug";
import { writeAuditLog } from "@/lib/audit";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type {
  CreateCredentialInput,
  UpdateCredentialInput,
} from "@/lib/validations/credential";

type CredentialScope = {
  credential: Awaited<ReturnType<typeof prisma.credential.findUnique>>;
  role: string | null;
  divisionId: string | null;
};

async function resolveCredential(
  id: string,
  userId: string,
): Promise<CredentialScope> {
  const credential = await prisma.credential.findUnique({
    where: { id },
    include: {
      project: { select: { divisionId: true } },
      fields: {
        select: { id: true, encryptedKey: true, credentialId: true },
      },
    },
  });

  if (!credential) {
    return { credential: null, role: null, divisionId: null };
  }

  const divisionIds = await getUserDivisionIds(userId);
  if (!divisionIds.includes(credential.project.divisionId)) {
    return { credential: null, role: null, divisionId: null };
  }

  const role = await getUserRoleInDivision(
    userId,
    credential.project.divisionId,
  );
  return { credential, role, divisionId: credential.project.divisionId };
}

export async function listCredentialsForUser(
  userId: string,
  filters: { projectId?: string | null; divisionId?: string | null },
) {
  const divisionIds = await getUserDivisionIds(userId);

  let projectFilter: {
    projectId?: string;
    project?: { divisionId: { in: string[] } };
  };

  if (filters.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: filters.projectId },
      select: { divisionId: true },
    });
    if (!project || !divisionIds.includes(project.divisionId)) {
      throw new ForbiddenError("Not a member of this division");
    }
    projectFilter = { projectId: filters.projectId };
  } else if (filters.divisionId) {
    if (!divisionIds.includes(filters.divisionId)) {
      throw new ForbiddenError("Not a member of this division");
    }
    projectFilter = { project: { divisionId: { in: [filters.divisionId] } } };
  } else {
    projectFilter = { project: { divisionId: { in: divisionIds } } };
  }

  return prisma.credential.findMany({
    where: projectFilter,
    include: {
      fields: {
        select: { id: true, credentialId: true },
      },
      project: { select: { id: true, name: true, divisionId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCredential(
  userId: string,
  input: CreateCredentialInput,
) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { divisionId: true },
  });
  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const role = await getUserRoleInDivision(userId, project.divisionId);
  if (role !== "DIVISION_OWNER" && role !== "DIVISION_ADMIN") {
    throw new ForbiddenError("Only admins can create credentials");
  }

  if (input.fields.length > 200) {
    throw new ValidationError("Cannot exceed 200 fields");
  }

  const slug = toSlug(input.name);

  const existing = await prisma.credential.findUnique({
    where: { projectId_slug: { projectId: input.projectId, slug } },
  });
  if (existing) {
    throw new ConflictError(
      "A credential with this name already exists in this project",
    );
  }

  const credential = await prisma.$transaction(async (tx) => {
    const cred = await tx.credential.create({
      data: {
        slug,
        name: input.name,
        environment: input.environment,
        projectId: input.projectId,
      },
    });

    for (const field of input.fields) {
      await tx.credentialField.create({
        data: {
          encryptedKey: encryptToString(field.key),
          encryptedValue: encryptToString(field.value ?? ""),
          credentialId: cred.id,
        },
      });
    }

    return tx.credential.findUnique({
      where: { id: cred.id },
      include: {
        fields: {
          select: { id: true, credentialId: true },
        },
      },
    });
  });

  if (!credential) {
    throw new Error("Failed to create credential");
  }

  await Promise.all([
    writeAuditLog({
      actorId: userId,
      action: "CREDENTIAL_CREATE",
      resourceType: "CREDENTIAL",
      resourceId: credential.id,
      resourceName: credential.name,
      credentialId: credential.id,
      divisionId: project.divisionId,
    }),
    prisma.project.update({
      where: { id: input.projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return credential;
}

export async function getCredentialById(userId: string, id: string) {
  const { credential } = await resolveCredential(id, userId);
  if (!credential) {
    throw new NotFoundError("Credential not found");
  }
  return credential;
}

export async function updateCredentialById(
  userId: string,
  id: string,
  input: UpdateCredentialInput,
) {
  const { credential, role, divisionId } = await resolveCredential(id, userId);
  if (!credential) {
    throw new NotFoundError("Credential not found");
  }

  if (role !== "DIVISION_OWNER" && role !== "DIVISION_ADMIN") {
    throw new ForbiddenError("Only admins can update credentials");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields !== undefined) {
      await tx.credentialField.deleteMany({ where: { credentialId: id } });
      for (const field of input.fields) {
        await tx.credentialField.create({
          data: {
            encryptedKey: encryptToString(field.key),
            encryptedValue: encryptToString(field.value ?? ""),
            credentialId: id,
          },
        });
      }
    }

    return tx.credential.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.environment !== undefined && {
          environment: input.environment,
        }),
      },
      include: {
        fields: {
          select: { id: true, credentialId: true },
        },
      },
    });
  });

  await Promise.all([
    writeAuditLog({
      actorId: userId,
      action: "CREDENTIAL_UPDATE",
      resourceType: "CREDENTIAL",
      resourceId: id,
      resourceName: credential.name,
      credentialId: id,
      divisionId: divisionId ?? undefined,
    }),
    prisma.project.update({
      where: { id: credential.projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return updated;
}

export async function deleteCredentialById(userId: string, id: string) {
  const { credential, role, divisionId } = await resolveCredential(id, userId);
  if (!credential) {
    throw new NotFoundError("Credential not found");
  }

  if (role !== "DIVISION_OWNER" && role !== "DIVISION_ADMIN") {
    throw new ForbiddenError("Only admins can delete credentials");
  }

  await writeAuditLog({
    actorId: userId,
    action: "CREDENTIAL_DELETE",
    resourceType: "CREDENTIAL",
    resourceId: id,
    resourceName: credential.name,
    credentialId: id,
    divisionId: divisionId ?? undefined,
    metadata: { changeDescription: `Deleted credential "${credential.name}"` },
  });

  await prisma.credential.delete({ where: { id } });

  await prisma.project.update({
    where: { id: credential.projectId },
    data: { updatedAt: new Date() },
  });
}

export async function revealCredentialFields(userId: string, id: string) {
  const credential = await prisma.credential.findUnique({
    where: { id },
    include: {
      project: { select: { divisionId: true } },
      fields: true,
    },
  });

  if (!credential) {
    throw new NotFoundError("Credential not found");
  }

  const divisionIds = await getUserDivisionIds(userId);
  if (!divisionIds.includes(credential.project.divisionId)) {
    throw new ForbiddenError("Not a member of this division");
  }

  const decryptedFields = credential.fields.map((field) => {
    try {
      return {
        id: field.id,
        key: decryptFromString(field.encryptedKey),
        value: decryptFromString(field.encryptedValue),
        credentialId: field.credentialId,
      };
    } catch (error) {
      console.error(
        `[revealCredentialFields] Failed to decrypt field ${field.id}:`,
        error,
      );
      return {
        id: field.id,
        key: "[decryption failed]",
        value: "",
        credentialId: field.credentialId,
        decryptionFailed: true,
      };
    }
  });

  await writeAuditLog({
    actorId: userId,
    action: "CREDENTIAL_VIEW",
    resourceType: "CREDENTIAL",
    resourceId: id,
    resourceName: credential.name,
    credentialId: id,
    divisionId: credential.project.divisionId,
  });

  return decryptedFields;
}
