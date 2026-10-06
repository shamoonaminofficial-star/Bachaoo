import React from 'react';

export function Card({ className = '', children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`rounded-2xl bg-white shadow-card border border-slate-100 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-5 pt-5 ${className}`}>{children}</div>;
}
export function CardTitle({ className = '', children }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-lg font-bold text-ink ${className}`}>{children}</h3>;
}
export function CardBody({ className = '', children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
export function CardFooter({ className = '', children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}
