/**
 * Typed configuration loaded from environment variables.
 * Access via ConfigService, e.g. config.get('supabase.url').
 */
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  clientOrigin: process.env.CLIENT_ORIGIN ?? '',

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL ?? '',
    apiKey: process.env.WHATSAPP_API_KEY ?? '',
    sender: process.env.WHATSAPP_SENDER ?? '',
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET ?? '',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? '',
  },

  clinic: {
    name: process.env.CLINIC_NAME ?? 'Expert Dental Center',
    googleReviewUrl: process.env.GOOGLE_REVIEW_URL ?? '',
  },
});
