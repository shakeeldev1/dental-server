import * as Joi from 'joi';

/**
 * Validates environment variables at startup.
 *
 * Supabase and WhatsApp values are intentionally OPTIONAL so the app can boot
 * during early development before those credentials are available. Services
 * that need them fail with a clear error only when actually used.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  CLIENT_ORIGIN: Joi.string().allow('').optional(),

  SUPABASE_URL: Joi.string().uri().allow('').optional(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().allow('').optional(),
  SUPABASE_JWT_SECRET: Joi.string().allow('').optional(),

  WHATSAPP_API_URL: Joi.string().uri().allow('').optional(),
  WHATSAPP_API_KEY: Joi.string().allow('').optional(),
  WHATSAPP_SENDER: Joi.string().allow('').optional(),
  WHATSAPP_WEBHOOK_SECRET: Joi.string().allow('').optional(),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').optional(),
  CLOUDINARY_API_KEY: Joi.string().allow('').optional(),
  CLOUDINARY_API_SECRET: Joi.string().allow('').optional(),
  CLOUDINARY_UPLOAD_FOLDER: Joi.string().allow('').optional(),

  CLINIC_NAME: Joi.string().allow('').optional(),
  GOOGLE_REVIEW_URL: Joi.string().allow('').optional(),
});
