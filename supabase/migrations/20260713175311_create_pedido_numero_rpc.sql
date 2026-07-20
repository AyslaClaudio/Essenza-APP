/*
# ESSENZA — Pedido number sequence RPC

Creates a function that returns and increments the next pedido number.
This is called when creating a new order to assign sequential numbers.
*/

CREATE OR REPLACE FUNCTION get_next_pedido_numero()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num int;
BEGIN
  next_num := nextval('pedido_numero_seq');
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_pedido_numero() TO anon, authenticated;
