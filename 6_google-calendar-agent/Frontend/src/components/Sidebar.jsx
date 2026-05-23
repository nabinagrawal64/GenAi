import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SquarePen, Trash2 } from "lucide-react";

export function Sidebar({ sessions, activeSession, onSessionSelect, onNewChat, onSessionDelete, className = "", style }) {
	return (
		<aside
			className={cn(
				"hidden flex-col border-r border-white/10 px-2 py-5 backdrop-blur-xl lg:flex",
				className
			)}
			style={style}
		>

			<button onClick={onNewChat} className="mb-4 flex cursor-pointer items-center gap-3 rounded-2xl  px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/15">
				<SquarePen className="size-5" />
				New chat
			</button>

			<div className="flex-1 rounded-3xl  p-3 text-slate-100">
				<div className="mb-3 flex items-center justify-between px-2">
					<p className="text-xs uppercase tracking-[0.24em] text-slate-400">History</p>
					<span className="text-xs text-slate-400">{sessions.length}</span>
				</div>

				<ScrollArea className="h-[calc(100vh-22rem)]">
					<div className="space-y-2">
						{sessions.map((session) => (
							<div
								key={session.id}
								className={cn(
									"group flex w-full items-center rounded-2xl border px-4 py-3 text-left transition",
									activeSession === session.id
										? "border-sky-400/50 bg-sky-400/25"
										: "border-white/10 bg-black/60 hover:bg-sky-400/10"
								)}
							>
								<button
									type="button"
									onClick={() => onSessionSelect(session.id)}
									className="min-w-0 flex-1 text-left"
								>
									<p className="truncate text-sm font-medium text-white">{session.title}</p>
								</button>
								<button
									type="button"
									aria-label={`Delete ${session.title}`}
									onClick={() => onSessionDelete(session.id)}
									className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/45 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-300/60"
								>
									<Trash2 className="size-4" />
								</button>
							</div>
						))}
					</div>
				</ScrollArea>
			</div>
		</aside>
	);
}
