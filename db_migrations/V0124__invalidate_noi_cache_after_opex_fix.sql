-- Инвалидируем кэш NOI-бенчмарков: принудительно истекаем все записи,
-- чтобы при следующем открытии карточки пересчитались с новыми нормативами OPEX/налога
UPDATE t_p71821556_real_estate_catalog_.noi_benchmarks_cache
SET expires_at = NOW() - INTERVAL '1 second';