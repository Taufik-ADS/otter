import { z } from "zod";

const environmentSchema = z.enum(["production", "staging", "development", "shared"]);

const credentialFieldSchema = z.object({
  key: z.string().min(1, "Key is required").max(200, "Key must be 200 characters or less"),
  value: z.string().max(10000, "Value must be 10000 characters or less").default(""),
});

export const createCredentialSchema = z.object({
  name: z
    .string()
    .min(1, "Credential name is required")
    .max(120, "Name must be 120 characters or less"),
  environment: environmentSchema.default("development"),
  projectId: z.string().min(1, "Project ID is required"),
  fields: z
    .array(credentialFieldSchema)
    .min(1, "At least one field is required")
    .max(200, "Cannot exceed 200 fields"),
});

export const updateCredentialSchema = z.object({
  name: z
    .string()
    .min(1, "Credential name is required")
    .max(120, "Name must be 120 characters or less")
    .optional(),
  environment: environmentSchema.optional(),
  fields: z
    .array(credentialFieldSchema)
    .min(1, "At least one field is required")
    .max(200, "Cannot exceed 200 fields")
    .optional(),
});

export const createCredentialFormSchema = z.object({
  name: z
    .string()
    .min(1, "Credential name is required")
    .max(120, "Name must be 120 characters or less"),
  environment: environmentSchema,
  projectId: z.string().min(1, "Project is required"),
  fields: z
    .array(credentialFieldSchema)
    .min(1, "At least one field is required")
    .max(200, "Cannot exceed 200 fields"),
});

export const updateCredentialFormSchema = z.object({
  name: z
    .string()
    .min(1, "Credential name is required")
    .max(120, "Name must be 120 characters or less"),
  environment: environmentSchema,
  fields: z
    .array(credentialFieldSchema)
    .min(1, "At least one field is required")
    .max(200, "Cannot exceed 200 fields"),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;
export type CreateCredentialFormInput = z.infer<typeof createCredentialFormSchema>;
export type UpdateCredentialFormInput = z.infer<typeof updateCredentialFormSchema>;
export type CredentialFieldInput = z.infer<typeof credentialFieldSchema>;
export type CredentialEnvironment = z.infer<typeof environmentSchema>;
export const CREDENTIAL_ENVIRONMENTS = ["production", "staging", "development", "shared"] as const;
