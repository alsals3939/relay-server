const requiredVariables = ['DATABASE_URL', 'JWT_SECRET'] as const;

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  for (const variable of requiredVariables) {
    if (!environment[variable]) {
      throw new Error(`필수 환경 변수 ${variable}가 설정되지 않았습니다.`);
    }
  }

  return {
    ...environment,
    PORT: Number(environment.PORT ?? 3001),
    JWT_EXPIRES_IN: environment.JWT_EXPIRES_IN ?? '7d',
  };
}
