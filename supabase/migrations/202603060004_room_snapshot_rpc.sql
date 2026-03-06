create or replace function public.get_room_snapshot(
  p_room_code text,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_question public.questions%rowtype;
  v_quiz_title text;
begin
  select r.*
  into v_room
  from public.rooms as r
  where r.room_code = upper(trim(coalesce(p_room_code, '')))
  limit 1;

  if not found then
    return null;
  end if;

  select qs.title
  into v_quiz_title
  from public.quiz_sets as qs
  where qs.id = v_room.quiz_set_id
  limit 1;

  select q.*
  into v_question
  from public.questions as q
  where q.quiz_set_id = v_room.quiz_set_id
    and q.order_index = v_room.current_question_index
  limit 1;

  return jsonb_build_object(
    'room',
    jsonb_build_object(
      'id', v_room.id,
      'room_code', v_room.room_code,
      'quiz_set_id', v_room.quiz_set_id,
      'status', v_room.status,
      'current_question_index', v_room.current_question_index,
      'question_started_at', v_room.question_started_at
    ),
    'quizTitle',
    coalesce(v_quiz_title, 'Untitled Quiz'),
    'totalQuestions',
    (
      select count(*)
      from public.questions as q_total
      where q_total.quiz_set_id = v_room.quiz_set_id
    ),
    'playerCount',
    (
      select count(*)
      from public.room_players as rp_total
      where rp_total.room_id = v_room.id
    ),
    'players',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', rp.id,
            'display_name', rp.display_name,
            'guest_id', rp.guest_id,
            'joined_at', rp.joined_at,
            'total_score', rp.total_score
          )
          order by rp.total_score desc, rp.joined_at asc
        )
        from (
          select
            rp.id,
            rp.display_name,
            rp.guest_id,
            rp.joined_at,
            rp.total_score
          from public.room_players as rp
          where rp.room_id = v_room.id
          order by rp.total_score desc, rp.joined_at asc
          limit 50
        ) as rp
      ),
      '[]'::jsonb
    ),
    'currentQuestion',
    case
      when v_question.id is null then null
      else jsonb_build_object(
        'question',
        jsonb_build_object(
          'id', v_question.id,
          'text', v_question.text,
          'time_limit_seconds', v_question.time_limit_seconds,
          'order_index', v_question.order_index
        ),
        'options',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'question_id', o.question_id,
                'text', o.text
              )
              order by o.id asc
            )
            from public.options as o
            where o.question_id = v_question.id
          ),
          '[]'::jsonb
        )
      )
    end,
    'currentQuestionAnswerCount',
    case
      when v_question.id is null then 0
      else (
        select count(*)
        from public.room_answers as ra_count
        where ra_count.room_id = v_room.id
          and ra_count.question_id = v_question.id
      )
    end,
    'playerAnswerForCurrent',
    case
      when p_player_id is null or v_question.id is null then null
      else (
        select to_jsonb(answer_row)
        from (
          select
            ra.id,
            ra.option_id,
            ra.is_correct,
            ra.score_awarded
          from public.room_answers as ra
          where ra.room_id = v_room.id
            and ra.player_id = p_player_id
            and ra.question_id = v_question.id
          limit 1
        ) as answer_row
      )
    end
  );
end;
$$;

revoke all on function public.get_room_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function public.get_room_snapshot(text, uuid) to service_role;
