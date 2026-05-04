-- Add Meta/WhatsApp approved template fields to CommunicationTemplate
ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaTemplateName" TEXT;
ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaLanguageCode" TEXT;

-- Add Meta template routing fields to OutboundMessage
ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateName" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateLanguage" TEXT;
ALTER TABLE "OutboundMessage" ADD COLUMN "metaTemplateVars" TEXT;
