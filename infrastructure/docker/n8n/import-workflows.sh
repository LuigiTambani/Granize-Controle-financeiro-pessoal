#!/bin/sh
set -eu

n8n import:workflow --input=/workflows/whatsapp-assistant.json
n8n publish:workflow --id=granizeWhatsappAssistant
n8n import:workflow --input=/workflows/monthly-email-summary.json
n8n publish:workflow --id=granizeMonthlyEmailSummary
