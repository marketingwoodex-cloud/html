# Needs validation
**NV-1 public-ai-chat-spend.** `api/chat.php` :40 rate-limits per IP (`vlimit`); `api/chat-lib.php` :143 calls the AI provider for each message. Rotating IPs could run up AI cost. Check: the provider's real cost/quota and whether a global cap exists in hosting. Not exploited.
