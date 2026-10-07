export interface ResourceReference { readonly id: string; readonly name: string }
export default function ResourceCard({ references, resource: id }: { references: readonly ResourceReference[]; resource: string }) {
  const target = references.find((entry) => entry.id === id);
  if (!target) throw new Error(`ResourceCard 目标未公开：${id}`);
  return <a className="resource-reference" href={`/resources/${target.id}/`}>{target.name}</a>;
}
