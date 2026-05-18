import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Key } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { CredentialForm } from "@/components/credentials/CredentialForm";
import { getProjectForCredentialCreate } from "@/lib/services/project-page.service";
import { isDomainError } from "@/lib/errors";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewProjectCredentialPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { slug } = await params;

  const project = await getProjectForCredentialCreate(userId, slug).catch(
    (error) => {
      if (isDomainError(error) && error.code === "NOT_FOUND") {
        notFound();
      }
      if (isDomainError(error) && error.code === "FORBIDDEN") {
        redirect(`/projects/${slug}`);
      }
      throw error;
    },
  );

  return (
    <div className="p-6 w-full mx-auto space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" className="rounded-lg px-2 text-xs">
          <Link href={`/projects/${slug}`}>
            <ArrowLeft weight="duotone" size={14} />
            Back to {project.name}
          </Link>
        </Button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-(--glass-bg-raised) border border-(--glass-border-subtle) flex items-center justify-center">
            <Key weight="duotone" size={20} color="var(--accent-primary)" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-(--text-primary)">
              New credential
            </h1>
            <p className="text-sm text-(--text-muted)">{project.name}</p>
          </div>
        </div>
      </div>

      <CredentialForm
        mode="create"
        projectId={project.id}
        projectName={project.name}
        returnUrl={`/projects/${slug}`}
      />
    </div>
  );
}
