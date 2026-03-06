create or replace function public.enforce_room_player_join_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_status text;
  v_player_count integer;
begin
  select r.status
  into v_room_status
  from public.rooms r
  where r.id = new.room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room_status <> 'lobby' then
    raise exception 'ROOM_JOIN_CLOSED';
  end if;

  select count(*)
  into v_player_count
  from public.room_players rp
  where rp.room_id = new.room_id;

  if v_player_count >= 50 then
    raise exception 'ROOM_FULL';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_room_players_join_guard on public.room_players;

create trigger trg_room_players_join_guard
before insert on public.room_players
for each row
execute function public.enforce_room_player_join_rules();
