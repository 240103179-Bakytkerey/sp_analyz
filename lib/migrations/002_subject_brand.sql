-- Пәндердің SapaLine-дағы ресми түсі мен логосы, және SapaLine пән коды (slug).
-- Дереккөз: sapaline.app веб-қосымшасының пәндер анықтамалығы (slug / color / logo).
-- Тек бос мәндер толтырылады: әкімші бұрын өзгерткен мәнді баспайды.
alter table subjects add column if not exists color text;
alter table subjects add column if not exists logo text;
update subjects set color = coalesce(subjects.color, m.color), logo = coalesce(subjects.logo, m.slug), sapaline_code = coalesce(nullif(subjects.sapaline_code, ''), m.slug)
from (values
  ('math', 'math', '#1B36B0'), ('geometry', 'geometry', '#00998A'), ('physics', 'physics', '#863E98'),
  ('chemistry', 'chemistry', '#007EFF'), ('biology', 'biology', '#008240'), ('geography', 'geography', '#00427B'),
  ('informatics', 'informatics', '#17404E'), ('kz_history', 'tarih', '#AE2A00'), ('world_history', 'djt', '#F07436'),
  ('law', 'law', '#007069'), ('math_lit', 'ms', '#00A3B6'), ('kaz_lang', 'til', '#B64861'),
  ('kaz_lit', 'adebiet', '#BB8E52'), ('toefl', 'toefl', '#FF5678'), ('rus_lang', 'russian', '#5364AF'),
  ('rus_lit', 'literature', '#A16321')
) as m(id, slug, color)
where subjects.id = m.id
