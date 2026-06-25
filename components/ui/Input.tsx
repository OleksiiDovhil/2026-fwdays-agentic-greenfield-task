// Base input primitive (cva + cn, shadcn conventions) — design.md D5,
// TC-STACK-02. The real city-search input (a later slice) builds on this. Uses
// the AA-grade `border-strong` edge and a visible keyboard focus ring
// (NFR-A11Y-01/02). Placeholder text uses muted-foreground, which clears AA.
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const inputVariants = cva(
  "flex w-full rounded-md border border-border-strong bg-surface px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        md: "h-10 text-sm",
        lg: "h-12 text-base",
      },
    },
    defaultVariants: {
      inputSize: "md",
    },
  },
);

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> &
  VariantProps<typeof inputVariants>;

export function Input({ className, inputSize, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(inputVariants({ inputSize }), className)}
      {...props}
    />
  );
}
