import { z } from "zod";

export const BaseContextSnapshotSchema = z.object({
  entityId: z.string().min(1, "entityId is required"),
  entityType: z.string().min(1, "entityType is required"),
  sourceVersion: z.number().int().positive().default(1),
  asOf: z.string().datetime().optional().default(() => new Date().toISOString()),
  locale: z.string().default("ar"),
  currency: z.string().length(3).default("USD"),
});

export type BaseContextSnapshot = z.infer<typeof BaseContextSnapshotSchema>;

export const ProjectContextSnapshotSchema = BaseContextSnapshotSchema.extend({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  specialtyName: z.string().optional(),
  budget: z.number().nonnegative().optional(),
  deadlineDays: z.number().positive().optional(),
  milestones: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string(),
    amount: z.number().nonnegative(),
    percentage: z.number().min(0).max(100),
    days: z.number().positive(),
  })).optional(),
});

export const DeliveryContextSnapshotSchema = BaseContextSnapshotSchema.extend({
  projectId: z.string().min(1),
  stageId: z.string().min(1),
  providerId: z.string().min(1),
  clientId: z.string().min(1),
  scopeAgreed: z.string().min(1),
  submissionDetails: z.string().min(1),
  submittedFiles: z.array(z.string()).default([]),
});

export const DisputeContextSnapshotSchema = BaseContextSnapshotSchema.extend({
  disputeId: z.string().min(1),
  projectId: z.string().min(1),
  clientId: z.string().min(1),
  providerId: z.string().min(1),
  clientClaim: z.string().min(1),
  providerClaim: z.string().min(1),
  agreedMilestones: z.array(z.string()).default([]),
  timelineEvents: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
  })).default([]),
});

export class ContextValidator {
  public static validateProject(data: unknown): z.infer<typeof ProjectContextSnapshotSchema> {
    return ProjectContextSnapshotSchema.parse(data);
  }

  public static validateDelivery(data: unknown): z.infer<typeof DeliveryContextSnapshotSchema> {
    return DeliveryContextSnapshotSchema.parse(data);
  }

  public static validateDispute(data: unknown): z.infer<typeof DisputeContextSnapshotSchema> {
    return DisputeContextSnapshotSchema.parse(data);
  }
}
