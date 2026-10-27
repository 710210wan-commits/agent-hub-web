export function ErrorState({ message }: { message: string }) {
  return <div className="state-card error-state" role="alert">{message}</div>;
}
