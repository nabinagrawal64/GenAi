import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import rehypeRaw from "rehype-raw";

import { cn } from "@/lib/utils";

export function MessageBubble({ role, content, isLoading = false }) {
	const isAssistant = role === "assistant";
	const [copied, setCopied] = useState(false);
	const [isTouchDevice, setIsTouchDevice] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return;
		}

		const mediaQuery = window.matchMedia("(pointer: coarse)");
		const updateTouchDevice = () => setIsTouchDevice(mediaQuery.matches);

		updateTouchDevice();
		mediaQuery.addEventListener("change", updateTouchDevice);

		return () => {
			mediaQuery.removeEventListener("change", updateTouchDevice);
		};
	}, []);

	const handleCopy = async () => {
		if (!content || isLoading) {
			return;
		}

		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			window.clearTimeout(handleCopy.resetTimer);
			handleCopy.resetTimer = window.setTimeout(() => {
				setCopied(false);
			}, 1500);
		} catch (error) {
			console.error("Failed to copy message:", error);
		}
	};

	const markdownComponents = {
		p: ({ children }) => <p className="mb-4 text-[15px] leading-7 text-zinc-100 last:mb-0">{children}</p>,
		h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-bold text-white first:mt-0">{children}</h1>,
		h2: ({ children }) => <h2 className="mb-4 mt-6 text-xl font-bold text-white first:mt-0">{children}</h2>,
		h3: ({ children }) => <h3 className="mb-4 mt-6 text-lg font-bold text-white first:mt-0">{children}</h3>,
		h4: ({ children }) => <h4 className="mb-4 mt-6 text-base font-semibold text-white first:mt-0">{children}</h4>,
		strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
		em: ({ children }) => <em className="italic">{children}</em>,
		ul: ({ children }) => <ul className="my-3 ml-6 list-disc space-y-2 text-zinc-100">{children}</ul>,
		ol: ({ children }) => <ol className="my-3 ml-6 list-decimal space-y-2 text-zinc-100">{children}</ol>,
		li: ({ children }) => <li>{children}</li>,
		blockquote: ({ children }) => <blockquote className="my-4 border-l border-zinc-700 pl-4 italic text-zinc-400">{children}</blockquote>,
		code: ({ inline, children }) =>
			inline ? (
				<code className="rounded bg-zinc-800 px-1.5 py-1 font-mono text-[13px] text-zinc-200">{children}</code>
			) : (
				<code className="block overflow-x-auto rounded-2xl bg-[#111214] p-4 font-mono text-[13px] leading-6 text-zinc-200">{children}</code>
			),
		pre: ({ children }) => <pre className="my-4 overflow-hidden rounded-2xl border border-zinc-800 bg-[#111214]">{children}</pre>,
		a: ({ children, href }) => (
			<a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline underline-offset-4 hover:text-blue-300">
				{children}
			</a>
		),
		table: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg border border-zinc-700/50 pb-px"><table className="w-full text-left text-[14px] text-zinc-100">{children}</table></div>,
		thead: ({ children }) => <thead className="bg-[#2f2f2f]/60 text-zinc-200">{children}</thead>,
		tbody: ({ children }) => <tbody className="divide-y divide-zinc-700/50">{children}</tbody>,
		tr: ({ children }) => <tr className="transition-colors hover:bg-zinc-800/30">{children}</tr>,
		th: ({ children }) => <th className="px-4 py-3 font-semibold">{children}</th>,
		td: ({ children }) => <td className="px-4 py-3 align-top">{children}</td>,
	};

	const assistantClass = "w-full lg:max-w-[min(720px,90%)] text-zinc-100 py-2";
	const userClass = "max-w-[min(720px,90%)] rounded-3xl bg-[#2f2f2f] px-5 py-2.5 text-zinc-100";

	return (
		<div className={cn("group flex w-full mb-3 md:mb-6", isAssistant ? "justify-start" : "justify-end")}>
			<div className={cn("flex w-full flex-col", isAssistant ? "items-start" : "items-end")}>
				<div className={cn("wrap-break-words", isAssistant ? assistantClass : userClass)}>
					{isLoading ? (
						<div className="flex items-center gap-2 text-[15px] leading-7 animate-pulse text-zinc-300">
							<span>Thinking</span>
						</div>
					) : (
						<ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkMath]} 
                            rehypePlugins={[rehypeKatex, rehypeRaw]} 
                            components={markdownComponents}
                        >
							{content}
						</ReactMarkdown>
					)}
				</div>

				{!isLoading && (
					<div className={cn("mt-0.5 md:mt-1 flex w-full", isAssistant ? "justify-start" : "justify-end")}>
						<button
							type="button"
							onClick={handleCopy}
							aria-label="Copy message"
							title={copied ? "Copied" : "Copy Message"}
							className={cn(
								"inline-flex cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/80 shadow-lg backdrop-blur transition-all duration-150",
								isAssistant
									? "opacity-100 translate-y-0 pointer-events-auto px-3 py-1.5 gap-1.5 text-[12px] font-medium"
									: isTouchDevice
										? "opacity-100 translate-y-0 pointer-events-auto px-2.5 py-2"
										: "opacity-0 translate-y-1 pointer-events-none px-3 py-1.5 gap-1.5 text-[12px] font-medium group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto",
								copied && "border-emerald-400/40 text-emerald-300"
							)}
							style={isTouchDevice ? { touchAction: "manipulation" } : undefined}
						>
							{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
							{!isTouchDevice && <span>{copied ? "Copied" : "Copy"}</span>}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
