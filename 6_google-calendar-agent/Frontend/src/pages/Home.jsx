import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Menu, Plus } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { FaArrowUpLong } from "react-icons/fa6";
import { auth, googleProvider } from "@/firebase/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const SESSIONS_STORAGE_KEY = "calendar-agent-chat-sessions";

const createThreadId = () => {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const createSession = (title = "New chat") => ({
    id: createThreadId(),
    title,
});

const getFallbackSessionTitle = (message) => {
    return message
        .replace(/\s+/g, " ")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .split(" ")
        .slice(0, 6)
        .join(" ") || "New chat";
};

const generateSessionTitle = async (message) => {
    try {
        const res = await fetch("http://localhost:3000/chat/title", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
        });

        if (!res.ok) {
            throw new Error("Failed to generate title");
        }

        const data = await res.json();
        return data.title || getFallbackSessionTitle(message);
    } catch (error) {
        console.error("Failed to generate chat title:", error);
        return getFallbackSessionTitle(message);
    }
};

const getInitialSessions = () => {
    try {
        const storedSessions = JSON.parse(sessionStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");

        if (Array.isArray(storedSessions) && storedSessions.length > 0) {
            const validSessions = storedSessions.filter((session) => session?.id);

            if (validSessions.length > 0) {
                return validSessions;
            }
        }
    } catch (error) {
        console.error("Failed to load chat sessions:", error);
    }

    return [createSession()];
};

export function Home() {
    const [sidebarWidth, setSidebarWidth] = useState(272);
    const [sessions, setSessions] = useState(getInitialSessions);
    const [activeSession, setActiveSession] = useState(() => sessions[0]?.id);
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [user, setUser] = useState(null);
    const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem('g-cal-token') || null);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isComposerWrapped, setIsComposerWrapped] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const endRef = useRef(null);
    const isResizingRef = useRef(false);
    const prevUserRef = useRef(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                // Clear google token on logout
                setGoogleToken(null);
                sessionStorage.removeItem('g-cal-token');
            } else {
                // Restore token from sessionStorage if available (page reload case)
                const stored = sessionStorage.getItem('g-cal-token');
                if (stored) setGoogleToken(stored);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const syncSessions = async () => {
            if (user) {
                try {
                    const res = await fetch("http://localhost:3000/chat/sessions", {
                        headers: {
                            "x-user-id": user.uid
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const fetchedSessions = data.sessions || [];
                        if (fetchedSessions.length > 0) {
                            setSessions(fetchedSessions);
                            setActiveSession(fetchedSessions[0].id);
                        } else {
                            const initialSess = createSession();
                            await fetch("http://localhost:3000/chat/sessions", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "x-user-id": user.uid
                                },
                                body: JSON.stringify({ threadId: initialSess.id, title: initialSess.title })
                            });
                            setSessions([initialSess]);
                            setActiveSession(initialSess.id);
                        }
                    } else {
                        console.error("Failed to fetch sessions from backend");
                    }
                } catch (error) {
                    console.error("Error fetching sessions:", error);
                }
            } else {
                try {
                    const storedSessions = JSON.parse(sessionStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
                    if (Array.isArray(storedSessions) && storedSessions.length > 0) {
                        const validSessions = storedSessions.filter((session) => session?.id);
                        if (validSessions.length > 0) {
                            setSessions(validSessions);
                            setActiveSession(validSessions[0].id);
                            return;
                        }
                    }
                } catch (error) {
                    console.error("Failed to load guest chat sessions:", error);
                }
                
                const guestSession = createSession();
                setSessions([guestSession]);
                setActiveSession(guestSession.id);
            }
        };

        syncSessions();
    }, [user]);

    useEffect(() => {
        if (!user && prevUserRef.current === null) {
            sessionStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
        }
        prevUserRef.current = user;
    }, [sessions, user]);

    useEffect(() => {
        const stopResizing = () => {
            isResizingRef.current = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        const handleMove = (event) => {
            if (!isResizingRef.current || !containerRef.current) {
                return;
            }

            const rect = containerRef.current.getBoundingClientRect();
            const nextWidth = event.clientX - rect.left;
            setSidebarWidth(Math.min(420, Math.max(240, nextWidth)));
        };

        document.addEventListener("pointermove", handleMove);
        document.addEventListener("pointerup", stopResizing);
        document.addEventListener("pointercancel", stopResizing);

        return () => {
            document.removeEventListener("pointermove", handleMove);
            document.removeEventListener("pointerup", stopResizing);
            document.removeEventListener("pointercancel", stopResizing);
        };
    }, []);

    useEffect(() => {
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "smooth",
                });
            }
        }, 10);
    }, [messages]);

    useEffect(() => {
        if (!inputRef.current) {
            return;
        }

        const textarea = inputRef.current;
        const styles = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        const maxHeight = lineHeight * 6 + verticalPadding;

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
        textarea.scrollTop = textarea.scrollHeight;
    }, [draft]);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!activeSession) {
                setMessages([]);
                return;
            }

            // Guests have no server-side history — start fresh in memory
            if (!user) {
                setMessages([]);
                return;
            }

            try {
                const headers = { "x-user-id": user.uid };
                const res = await fetch(`http://localhost:3000/chat/history/${activeSession}`, {
                    headers
                });
                const data = await res.json();
                setMessages(data.messages || []);
            } catch (error) {
                console.error("Failed to load chat history:", error);
            }
        };
        fetchHistory();
    }, [activeSession, user]);

    const handleNewChat = async () => {
        const existingNewChat = sessions.find((session) => session.title === "New chat");

        if (existingNewChat) {
            setActiveSession(existingNewChat.id);
            setMessages([]);
            setDraft("");
            setIsComposerWrapped(false);
            inputRef.current?.focus();
            return;
        }

        const nextSession = createSession();

        if (user) {
            try {
                await fetch("http://localhost:3000/chat/sessions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-user-id": user.uid
                    },
                    body: JSON.stringify({ threadId: nextSession.id, title: nextSession.title })
                });
            } catch (error) {
                console.error("Failed to save new session to backend:", error);
            }
        }

        setSessions((prev) => [nextSession, ...prev]);
        setActiveSession(nextSession.id);
        setMessages([]);
        setDraft("");
        setIsComposerWrapped(false);
        inputRef.current?.focus();
    };

    const handleSessionDelete = async (sessionId) => {
        if (user) {
            try {
                await fetch(`${import.meta.env.VITE_BACKEND_URL}/chat/sessions/${sessionId}`, {
                    method: "DELETE",
                    headers: {
                        "x-user-id": user.uid
                    }
                });
            } catch (error) {
                console.error("Failed to delete session on backend:", error);
            }
        }

        setSessions((prev) => {
            const remainingSessions = prev.filter((session) => session.id !== sessionId);

            if (remainingSessions.length === 0) {
                const nextSession = createSession();
                if (user) {
                    fetch(`${import.meta.env.VITE_BACKEND_URL}/chat/sessions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-user-id": user.uid
                        },
                        body: JSON.stringify({ threadId: nextSession.id, title: nextSession.title })
                    }).catch((err) => console.error(err));
                }
                setActiveSession(nextSession.id);
                setMessages([]);
                setDraft("");
                setIsComposerWrapped(false);
                return [nextSession];
            }

            if (sessionId === activeSession) {
                setActiveSession(remainingSessions[0].id);
                setMessages([]);
                setDraft("");
                setIsComposerWrapped(false);
            }

            return remainingSessions;
        });

        inputRef.current?.focus();
    };

    const startResizing = () => {
        isResizingRef.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    };

    const handleGoogleLogin = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setGoogleToken(credential.accessToken);
                sessionStorage.setItem('g-cal-token', credential.accessToken);
            }
        } catch (error) {
            console.error("Login failed:", error);
        }
    };

    const confirmLogout = async () => {
        try {
            sessionStorage.removeItem(SESSIONS_STORAGE_KEY);
            sessionStorage.removeItem('g-cal-token');
            setGoogleToken(null);
            const guestSess = createSession();
            setSessions([guestSess]);
            setActiveSession(guestSess.id);
            setMessages([]);
            await signOut(auth);
            setShowLogoutModal(false);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    const handleSend = async () => {
        const content = draft.trim();

        if (!content || isSending) {
            return;
        }

        const currentSessionId = activeSession;
        setIsSending(true);
        setDraft("");
        setIsComposerWrapped(false);

        const userMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content,
        };
        const loadingMessage = {
            id: `${Date.now()}-loading`,
            role: "assistant",
            content: "Loading...",
            isLoading: true,
        };
        const shouldGenerateTitle = sessions.some(
            (session) => session.id === currentSessionId && session.title === "New chat"
        );

        setMessages((prev) => [...prev, userMessage, loadingMessage]);
        if (shouldGenerateTitle) {
            generateSessionTitle(content).then((title) => {
                setSessions((prev) =>
                    prev.map((session) =>
                        session.id === currentSessionId && session.title === "New chat"
                            ? { ...session, title }
                            : session
                    )
                );
                if (user) {
                    fetch(`${import.meta.env.VITE_BACKEND_URL}/chat/sessions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-user-id": user.uid
                        },
                        body: JSON.stringify({ threadId: currentSessionId, title })
                    }).catch((err) => console.error("Failed to save updated title to backend:", err));
                }
            });
        }
        inputRef.current?.focus();

        try {
            const headers = {
                "Content-Type": "application/json",
            };
            if (user) {
                headers["x-user-id"] = user.uid;
            }
            if (googleToken) {
                headers["x-google-token"] = googleToken;
            }

            // For guests, pass in-memory messages as context (no server-side history)
            const previousMessagesForContext = !user
                ? messages
                    .filter((m) => !m.isLoading && (m.role === "user" || m.role === "assistant"))
                    .filter((m) => m.id !== loadingMessage.id)
                    .map((m) => ({ role: m.role, content: m.content }))
                : undefined;

            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/chat`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    message: content,
                    threadId: currentSessionId,
                    ...(previousMessagesForContext !== undefined ? { previousMessages: previousMessagesForContext } : {}),
                }),
            });
            const data = await res.json();

            setMessages((prev) => [
                ...prev.filter((message) => message.id !== loadingMessage.id),
                {
                    id: `${Date.now()}-assistant`,
                    role: "assistant",
                    content: data.reply || "Sorry, I couldn't understand that.",
                },
            ]);
        } catch (error) {
            console.error("Failed to fetch response:", error);
            setMessages((prev) => [
                ...prev.filter((message) => message.id !== loadingMessage.id),
                {
                    id: `${Date.now()}-assistant`,
                    role: "assistant",
                    content: "Failed to connect to the server.",
                },
            ]);
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        handleSend();
    };

    const updateComposerWrapState = (textarea, value) => {
        if (!value) {
            setIsComposerWrapped(false);
            return;
        }

        if (value.includes("\n")) {
            setIsComposerWrapped(true);
            return;
        }

        textarea.style.height = "auto";

        const styles = window.getComputedStyle(textarea);
        const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        const oneLineHeight = lineHeight + verticalPadding;

        setIsComposerWrapped(textarea.scrollHeight > oneLineHeight + 1);
    };

    const handleDraftChange = (event) => {
        const nextDraft = event.target.value;

        setDraft(nextDraft);
        updateComposerWrapState(event.target, nextDraft);
    };

    const handleDraftKeyDown = (event) => {
        if (event.key !== "Enter") {
            return;
        }

        if (event.shiftKey) {
            event.preventDefault();

            const textarea = event.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const nextDraft = `${draft.slice(0, start)}\n${draft.slice(end)}`;

            setDraft(nextDraft);
            setIsComposerWrapped(true);
            requestAnimationFrame(() => {
                textarea.selectionStart = start + 1;
                textarea.selectionEnd = start + 1;
            });
            return;
        }

        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            handleSend();
        }
    };

    const isComposerExpanded = draft.includes("\n") || isComposerWrapped;

    return (
        <main className="min-h-screen bg-black text-white">
            <div ref={containerRef} className="flex h-screen overflow-hidden relative">
                <Sidebar
                    sessions={sessions}
                    activeSession={activeSession}
                    onSessionSelect={(id) => {
                        setActiveSession(id);
                        setIsMobileMenuOpen(false);
                    }}
                    onNewChat={() => {
                        handleNewChat();
                        setIsMobileMenuOpen(false);
                    }}
                    onSessionDelete={handleSessionDelete}
                    className={`no-scrollbar h-screen shrink-0 overflow-y-auto lg:flex lg:flex-col ${isMobileMenuOpen ? "fixed inset-y-0 left-0 z-50 flex flex-col bg-black border-r border-white/10 w-[272px]" : "hidden"}`}
                    style={{ width: isMobileMenuOpen ? 272 : sidebarWidth }}
                />

                {isMobileMenuOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                )}

                {/* Resize Handle */}
                <div
                    onPointerDown={startResizing}
                    className="group hidden w-1 shrink-0 cursor-col-resize bg-white/5 transition hover:bg-white/10 lg:block"
                    aria-hidden="true"
                >
                    <div className="mx-auto h-full w-px bg-white/10 transition group-hover:bg-white/20" />
                </div>

                {/* Chat Section */}
                <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
                    {/* Chat Header */}

                    <header className="flex items-center justify-between px-5 py-2 md:px-6">
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="flex cursor-pointer size-9 items-center justify-center rounded-full border border-white/10 text-white/70 lg:hidden hover:bg-white/10"
                        >
                            <Menu className="size-4" />
                        </button>
                        <div className="flex items-center gap-2">
                            <h1 className="text-[18px] font-semibold text-white">CalGPT </h1>
                            <ChevronDown className="size-4 text-white/70" />
                        </div>

                        <div className="cursor-pointer items-center justify-center flex">
                            {user ? (
                                <button title="Sign out" onClick={() => setShowLogoutModal(true)} className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-white/10 transition hover:opacity-80">
                                    <span className="flex cursor-pointer size-full items-center justify-center bg-white/10 text-sm font-medium text-white">
                                        {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                                    </span>
                                </button>
                            ) : (
                                <button title="Sign in with Google" onClick={handleGoogleLogin} className="flex cursor-pointer size-9 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white">
                                    <Globe className="size-4" />
                                </button>
                            )}
                        </div>
                    </header>

                    {/* Chat Window */}
                    <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
                        <div className="mx-auto flex min-h-full w-full max-w-190 flex-col py-6 sm:py-10">
                            {messages.length > 0 ? (
                                <div className="flex flex-1 flex-col gap-2">
                                    {messages.map((message) => (
                                        <MessageBubble key={message.id} role={message.role} content={message.content} isLoading={message.isLoading} />
                                    ))}
                                    <div ref={endRef} className="h-4" />
                                </div>
                            ) : (
                                <div className="flex flex-1 items-center justify-center">
                                    <div className="flex w-full max-w-190 flex-col items-center justify-center text-center">
                                        <h2 className="mb-10 text-[26px] font-medium leading-none tracking-[-0.03em] text-white sm:text-[32px]">
                                            What's in your mind?
                                        </h2>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Input Chat */}
                    <form onSubmit={handleSubmit} className="shrink-0 px-4 pb-6">
                        <div className={`mx-auto flex w-full max-w-190 rounded-[2rem] border border-white/10 bg-[#242424] md:px-3 md:py-2 px-2 py-1 ] ${isComposerExpanded ? "flex-col" : "items-end"}`}>
                            {!isComposerExpanded && (
                                <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10">
                                    <Plus className="size-6 mb-2.5" />
                                </button>
                            )}
                            <div className="relative min-w-0 flex-1">
                                <textarea
                                    ref={inputRef}
                                    placeholder="Ask anything"
                                    value={draft}
                                    onChange={handleDraftChange}
                                    onKeyDown={handleDraftKeyDown}
                                    rows={1}
                                    className="composer-scrollbar min-h-9 min-w-0 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 text-white outline-none placeholder:text-white/45 disabled:opacity-70"
                                />
                                {draft && !isComposerExpanded && (
                                    <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-[#242424] via-[#242424]/90 to-transparent" />
                                )}
                            </div>
                            {isComposerExpanded ? (
                                <div className="flex items-center justify-between">
                                    <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10">
                                        <Plus className="size-6" />
                                    </button>
                                    <button type="submit" disabled={!draft.trim() || isSending} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1d7bf0] text-white ] transition disabled:cursor-not-allowed disabled:opacity-50">
                                        <FaArrowUpLong />
                                    </button>
                                </div>
                            ) : (
                                <button type="submit" disabled={!draft.trim() || isSending} className="flex size-8 mb-1.5 shrink-0 items-center justify-center rounded-full bg-[#1d7bf0] text-white transition disabled:cursor-not-allowed disabled:opacity-50">
                                    <FaArrowUpLong />
                                </button>
                            )}
                        </div>
                    </form>
                </section>
            </div>

            {/* Logout Confirmation Modal */}
            {showLogoutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs px-4">
                    <div className="w-full max-w-sm rounded-2xl bg-[#212121] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-white/10">
                        <h2 className="mb-2 text-xl font-semibold text-white">Sign Out</h2>
                        <p className="mb-6 text-[15px] text-zinc-400">Are you sure you want to sign out of your account?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowLogoutModal(false)}
                                className="rounded-full cursor-pointer px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmLogout}
                                className="rounded-full cursor-pointer bg-red-500/20 px-5 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/30"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
