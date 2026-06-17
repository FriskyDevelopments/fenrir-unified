type ErrorMessageProps = {
  title: string;
  message: string;
  details?: string;
  className?: string;
};

export function ErrorMessage({ title, message, details, className = "" }: ErrorMessageProps) {
  return (
    <div className={`p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg ${className}`.trim()}>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p>{message}</p>
      {details && <p className="mt-4 text-sm opacity-80">{details}</p>}
    </div>
  );
}
