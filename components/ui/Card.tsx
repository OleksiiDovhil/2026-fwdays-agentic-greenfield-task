// Base card/surface primitive (cva + cn, shadcn conventions) — design.md D5,
// TC-STACK-02. A calm surface container that later slots (forecast, map, compare)
// render into. Keyed off the AA-contrast palette tokens.
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const cardVariants = cva(
  "rounded-xl border bg-surface text-foreground",
  {
    variants: {
      padded: {
        true: "p-5",
        false: "",
      },
      tone: {
        // Subtle hairline separator (decorative) vs a stronger, AA-grade edge.
        subtle: "border-border",
        strong: "border-border-strong",
      },
    },
    defaultVariants: {
      padded: true,
      tone: "subtle",
    },
  },
);

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ className, padded, tone, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ padded, tone }), className)} {...props} />
  );
}
