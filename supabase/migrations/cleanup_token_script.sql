DELETE FROM oauth_tokens
WHERE access_token_expires_at < NOW()
  AND (refresh_token_expires_at IS NULL OR refresh_token_expires_at < NOW());


-- Or delete all
-- DELETE FROM oauth_tokens;