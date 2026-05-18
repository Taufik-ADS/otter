import { prisma } from "../lib/prisma";
import { encryptToString } from "../lib/crypto";

async function test() {
  // Check projects
  const projects = await prisma.project.findMany({
    take: 3,
    select: { id: true, name: true, slug: true, divisionId: true },
  });
  console.log("Projects:", JSON.stringify(projects, null, 2));

  // Check memberships
  const memberships = await prisma.divisionMembership.findMany({
    take: 5,
    select: { clerkId: true, divisionId: true, role: true },
  });
  console.log("Memberships:", JSON.stringify(memberships, null, 2));

  if (projects.length === 0) {
    console.log("No projects found!");
    process.exit(0);
  }

  const project = projects[0];
  console.log("Testing create on project:", project.id, project.name);

  try {
    const cred = await prisma.credential.create({
      data: {
        slug: "test-debug-" + Date.now(),
        name: "Test Debug " + Date.now(),
        environment: "development",
        projectId: project.id,
        fields: {
          create: [
            {
              encryptedKey: encryptToString("TEST_KEY"),
              encryptedValue: encryptToString("test_value"),
            },
          ],
        },
      },
      include: {
        fields: { select: { id: true, credentialId: true } },
      },
    });
    console.log("✅ CREATE SUCCESS:", JSON.stringify(cred, null, 2));

    // Clean up
    await prisma.credential.delete({ where: { id: cred.id } });
    console.log("✅ Cleanup done");
  } catch (err: any) {
    console.error("❌ CREATE FAILED:", err.message);
    console.error("Full error:", err);
  }

  process.exit(0);
}

test();
