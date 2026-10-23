type Props = {
  title: string;
  description: string;
};

export function ComingSoon({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
