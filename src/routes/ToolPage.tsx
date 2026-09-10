import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { categoryName } from '@/core/categories';
import { usePrefs } from '@/core/prefs';
import { getTool } from '@/core/registry';
import { DependencyGate } from '@/components/tool';
import { Badge, Button, EmptyState, Icon, IconButton, Kbd, Spinner } from '@/components/ui';

/** Files handed over from the Home quick actions, consumed by the tool's file hook. */
export interface ToolNavigationState {
  files?: string[];
}

export function ToolPage() {
  const { '*': rest } = useParams();
  const toolId = rest ?? '';
  const tool = getTool(toolId);
  const navigate = useNavigate();
  const location = useLocation();
  const isFavorite = usePrefs((s) => s.favorites.includes(toolId));
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);

  const Component = useMemo(() => (tool ? lazy(tool.load) : null), [tool]);

  useEffect(() => {
    if (tool) document.title = `${tool.name} — Toolbox`;
    return () => {
      document.title = 'Toolbox';
    };
  }, [tool]);

  if (!tool || !Component) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState
          icon="SearchX"
          title="Tool not found"
          description={`No tool is registered with the id “${toolId}”.`}
          action={
            <Button icon="House" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          }
        />
      </div>
    );
  }

  const state = (location.state ?? {}) as ToolNavigationState;

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <nav className="mb-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        <Link to="/" className="hover:text-ink">
          Home
        </Link>
        <Icon name="ChevronRight" size={12} />
        <Link to={`/c/${tool.category}`} className="hover:text-ink">
          {categoryName(tool.category)}
        </Link>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel text-ink-soft ring-1 ring-line">
            <Icon name={tool.icon} size={17} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">{tool.name}</h1>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">{tool.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tool.requires?.map((r) => (
            <Badge key={r} tone="neutral">
              <Icon name="Terminal" size={10} />
              {r}
            </Badge>
          ))}
          <span className="hidden items-center gap-1 text-[11px] text-ink-faint lg:flex" title="Run this tool">
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>C</Kbd>
          </span>
          <IconButton
            icon="Star"
            label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => toggleFavorite(tool.id)}
            className={isFavorite ? '[&_svg]:fill-current text-ink' : ''}
          />
        </div>
      </header>

      <DependencyGate requires={tool.requires}>
        <Suspense
          fallback={
            <div className="flex items-center gap-2 py-16 text-[12.5px] text-ink-faint">
              <Spinner /> Loading tool…
            </div>
          }
        >
          <ToolErrorBoundary toolName={tool.name}>
            <Component key={tool.id + (state.files?.join('|') ?? '')} />
          </ToolErrorBoundary>
        </Suspense>
      </DependencyGate>
    </div>
  );
}

import { Component as ReactComponent, type ErrorInfo, type ReactNode } from 'react';

class ToolErrorBoundary extends ReactComponent<
  { children: ReactNode; toolName: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[toolbox] ${this.props.toolName} crashed`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          icon="CircleAlert"
          title={`${this.props.toolName} ran into a problem`}
          description={this.state.error.message}
          action={
            <Button icon="RotateCcw" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
