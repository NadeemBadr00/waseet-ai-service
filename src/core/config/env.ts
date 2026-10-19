import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),
  DEFAULT_CURRENCY: z.string().default("USD"),
  ASSESSMENT_PASS_SCORE: z.coerce.number().default(70),
  ASSESSMENT_TIME_LIMIT_MINUTES: z.coerce.number().default(15),
  ASSESSMENT_QUESTION_COUNT: z.coerce.number().default(20),
  WASEET_AI_CLIENT_ID: z.string().default("waseet_core_backend"),
  WASEET_AI_CLIENT_SECRET: z.string().default(""),
  WASEET_AI_ENVIRONMENT: z.enum(["dev", "bank", "prod"]).default("dev"),
  WASEET_AI_TOKEN_SIGNING_SECRET: z.string().default(""),
  WASEET_AI_ALLOWED_ORIGINS: z.string().default(""),
  // Paid Google Cloud project
  GEMINI_PAID_PROJECT_ID: z.string().default("projects/1041761245251"),
  GEMINI_PAID_API_KEY: z.string().default(""),
  // 8 Free Google Cloud projects
  GEMINI_FREE_PROJECT_1_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_2_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_3_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_4_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_5_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_6_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_7_KEY: z.string().default(""),
  GEMINI_FREE_PROJECT_8_KEY: z.string().default(""),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export const env: EnvConfig = EnvSchema.parse(process.env);
