-- SMART PRO комбинациялары (бөлім берген тізім) және олардың пәндері.
-- aliases — импортта (SapaLine коды, курс атауы, Telegram мәтіні) танылатын баламалы кодтар.
-- subjects — комбинацияға кіретін пәндер: есеп формасында тек сол пәнге қатысты комбинациялар ұсынылады.
alter table combinations add column if not exists aliases jsonb not null default '[]'::jsonb;
alter table combinations add column if not exists subjects jsonb not null default '[]'::jsonb;

-- БХ → БИОХИМ, ФХ → ФИЗХИМ (id сол күйі қалады, бұрынғы есептер өзгермейді; ескі код бүркеншік атқа көшеді)
update combinations set code = 'БИОХИМ', name = 'Биология – Химия', aliases = '["БХ"]'::jsonb
where id = 'c_bh' and code = 'БХ' and not exists (select 1 from combinations x where x.code = 'БИОХИМ');
update combinations set code = 'ФИЗХИМ', name = 'Физика – Химия', aliases = '["ФХ"]'::jsonb
where id = 'c_fh' and code = 'ФХ' and not exists (select 1 from combinations x where x.code = 'ФИЗХИМ');

insert into combinations (id, code, name, sort) values
  ('c_bh', 'БИОХИМ', 'Биология – Химия', 1),
  ('c_biogeo', 'БИОГЕО', 'Биология – География', 2),
  ('c_adebtil', 'ӘДЕБТІЛ', 'Қазақ тілі – Қазақ әдебиеті', 3),
  ('c_ruslit', 'РУСЛИТ', 'Орыс тілі – Орыс әдебиеті', 4),
  ('c_geomat', 'ГЕОМАТ', 'География – Математика', 5),
  ('c_geoangl', 'ГЕОАНГЛ', 'География – Ағылшын тілі', 6),
  ('c_fizmat', 'ФИЗМАТ', 'Физика – Математика', 7),
  ('c_infomat', 'ИНФОМАТ', 'Информатика – Математика', 8),
  ('c_fh', 'ФИЗХИМ', 'Физика – Химия', 9),
  ('c_djtquq', 'ДЖТҚҰҚЫҚ', 'Дүниежүзі тарихы – Құқық', 10),
  ('c_djtangl_ielts', 'ДЖТАНГЛ IELTS', 'Дүниежүзі тарихы – Ағылшын (IELTS)', 11),
  ('c_djtangl_toefl', 'ДЖТАНГЛ TOEFL', 'Дүниежүзі тарихы – Ағылшын (TOEFL)', 12),
  ('c_geodjt', 'ГЕОДЖТ', 'География – Дүниежүзі тарихы', 13)
on conflict do nothing;

update combinations c set subjects = m.subjects::jsonb, sort = m.sort
from (values
  ('БИОХИМ', '["biology","chemistry"]', 1),
  ('БИОГЕО', '["biology","geography"]', 2),
  ('ӘДЕБТІЛ', '["kaz_lang","kaz_lit"]', 3),
  ('РУСЛИТ', '["rus_lang","rus_lit"]', 4),
  ('ГЕОМАТ', '["geography","math","geometry"]', 5),
  ('ГЕОАНГЛ', '["geography","toefl"]', 6),
  ('ФИЗМАТ', '["physics","math","geometry"]', 7),
  ('ИНФОМАТ', '["informatics","math","geometry"]', 8),
  ('ФИЗХИМ', '["physics","chemistry"]', 9),
  ('ДЖТҚҰҚЫҚ', '["world_history","law"]', 10),
  ('ДЖТАНГЛ IELTS', '["world_history","toefl"]', 11),
  ('ДЖТАНГЛ TOEFL', '["world_history","toefl"]', 12),
  ('ГЕОДЖТ', '["geography","world_history"]', 13)
) as m(code, subjects, sort)
where c.code = m.code and c.subjects = '[]'::jsonb
