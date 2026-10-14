"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** Native top layer avoids clipping by fixed workspaces and manages modal focus. */
export function WorkspaceDialog({ id, title, children, onClose, busy=false, drawer=false, focusCloseButton=true }: {
  id?:string; title:string; children:ReactNode; onClose:()=>void; busy?:boolean; drawer?:boolean; focusCloseButton?:boolean;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const dialog=ref.current;
    dialog?.showModal();
    if(!focusCloseButton)dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();
    return()=>{dialog?.close();if(previous?.isConnected)previous.focus();};
  },[focusCloseButton]);
  return <dialog id={id} ref={ref} className={`workspace-dialog${drawer?" workspace-drawer":""}`} aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className="workspace-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" autoFocus={focusCloseButton} disabled={busy} aria-label="关闭窗口" onClick={onClose}>×</button></header>
    <div className="workspace-dialog-body">{children}</div>
  </dialog>;
}
