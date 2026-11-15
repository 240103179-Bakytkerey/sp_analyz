-- Платформа есептерінің ішіне салынған (base64) суреттер: хэш бойынша бір рет сақталады.
create table if not exists task_images (
  hash text primary key,
  mime text not null,
  body bytea not null,
  created_at timestamptz not null default now()
)
