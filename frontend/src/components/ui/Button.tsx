import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "danger" | "ghost";
type Size = "md" | "sm";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

export default function Button({
  variant = "primary", size = "md", className = "", children, ...rest
}: Props) {
  const cls = [VARIANT[variant], size === "sm" ? "btn-sm" : "", className]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
