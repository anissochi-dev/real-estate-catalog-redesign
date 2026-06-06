-- Добавляем новые районы Краснодара (по алфавиту)
INSERT INTO t_p71821556_real_estate_catalog_.districts (name, slug, city) VALUES
('Вавилова', 'vavilova', 'Краснодар'),
('Восточно-Кругликовский', 'vostochno-kruglikovskiy', 'Краснодар'),
('Горхутор', 'gorhutor', 'Краснодар'),
('Догма парк', 'dogma-park', 'Краснодар'),
('Дубинка', 'dubinka', 'Краснодар'),
('Знаменский', 'znamenskiy', 'Краснодар'),
('Кирпичного завода пос.', 'kirpichnogo-zavoda', 'Краснодар'),
('Ленина хутор', 'lenina-hutor', 'Краснодар'),
('Любимово', 'lyubimovo', 'Краснодар'),
('Народные кварталы', 'narodnye-kvartaly', 'Краснодар'),
('Образцово', 'obraztsovo', 'Краснодар'),
('Петра-Метальникова', 'petra-metalnikova', 'Краснодар'),
('Покровка', 'pokrovka', 'Краснодар'),
('Почтовый', 'pochtovyy', 'Краснодар'),
('Прогресс п.', 'progress', 'Краснодар'),
('Россинского', 'rossinskogo', 'Краснодар'),
('Солнечный остров', 'solnechnyy-ostrov', 'Краснодар'),
('Южный п.', 'yuzhnyy', 'Краснодар')
ON CONFLICT DO NOTHING;
