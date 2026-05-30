UPDATE t_p71821556_real_estate_catalog_.listings
SET slug = (
    SUBSTRING(
        regexp_replace(
            regexp_replace(
                lower(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(
                    replace(replace(replace(COALESCE(title,''),
                    'а','a'),'б','b'),'в','v'),'г','g'),'д','d'),
                    'е','e'),'ё','e'),'ж','zh'),'з','z'),'и','i'),
                    'й','y'),'к','k'),'л','l'),'м','m'),'н','n'),
                    'о','o'),'п','p'),'р','r'),'с','s'),'т','t'),
                    'у','u'),'ф','f'),'х','h'),'ц','ts'),'ч','ch'),
                    'ш','sh'),'щ','sch'),'ъ',''),'ы','y'),'ь',''),
                    'э','e'),'ю','yu'),'я','ya')
                ),
                '[^a-z0-9]+', '-', 'g'
            ),
            '^\-+|\-+$', '', 'g'
        ),
        1, 80
    ) || '-' || id::text
)
WHERE slug IS NULL OR slug = '';