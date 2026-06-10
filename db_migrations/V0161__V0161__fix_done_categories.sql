UPDATE t_p71821556_real_estate_catalog_.market_scraper_progress
SET is_done = TRUE
WHERE source = 'arrpro' AND is_done = FALSE AND last_page > 0;