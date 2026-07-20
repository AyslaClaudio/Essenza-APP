import { useState, useCallback } from 'react';
import { z, ZodSchema } from 'zod';
import { logger } from '../lib/logger';

interface UseFormOptions<T> {
  initialValues: T;
  schema: ZodSchema;
  onSubmit: (values: T) => Promise<void>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Record<string, string>;
  isValid: boolean;
  isSubmitting: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleChangeValue: (key: keyof T, value: any) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: () => void;
  setFieldValue: (key: keyof T, value: any) => void;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  schema,
  onSubmit,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value, type } = e.target;
      const finalValue =
        type === 'number' ? (value ? parseFloat(value) : 0) :
        type === 'checkbox' ? (e.target as HTMLInputElement).checked :
        value;

      setValues((prev) => ({
        ...prev,
        [name]: finalValue,
      }));

      if (errors[name]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const handleChangeValue = useCallback((key: keyof T, value: any) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key as string];
        return newErrors;
      });
    }
  }, [errors]);

  const setFieldValue = useCallback((key: keyof T, value: any) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const validate = useCallback((): boolean => {
    try {
      schema.parse(values);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  }, [schema, values]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!validate()) {
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (error) {
        logger.error('Erro ao enviar formulário', error instanceof Error ? error : undefined);
        setErrors({
          _form: error instanceof Error ? error.message : 'Erro ao enviar formulário',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, onSubmit, values]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  const isValid = Object.keys(errors).length === 0;

  return {
    values,
    errors,
    isValid,
    isSubmitting,
    handleChange,
    handleChangeValue,
    handleSubmit,
    reset,
    setFieldValue,
    setErrors,
  };
}
