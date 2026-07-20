/*
# ESSENZA — Create default Gerente user

Creates the default gerente auth user so the system is usable on first launch.
Email: gerente@essenza.com / Password: essenza123
Also inserts the matching usuarios row with role 'gerente'.
*/

DO $$
DECLARE
  new_user_id uuid;
BEGIN
  SELECT id INTO new_user_id FROM auth.users WHERE email = 'gerente@essenza.com';
  IF new_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'gerente@essenza.com',
      crypt('essenza123', gen_salt('bf')),
      now(), now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      '', ''
    ) RETURNING id INTO new_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE user_id = new_user_id) THEN
    INSERT INTO usuarios (user_id, nome, role) VALUES (new_user_id, 'Gerente ESSENZA', 'gerente');
  END IF;
END $$;
