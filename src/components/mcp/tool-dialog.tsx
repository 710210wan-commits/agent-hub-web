"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './mcp-console.module.css';

export function ToolDialog({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  const previous=document.activeElement as HTMLElement|null;
  const overflow=document.body.style.overflow;
  dialog?.showModal();document.body.style.overflow='hidden';
  return()=>{dialog?.close();document.body.style.overflow=overflow;previous?.focus();};
 },[]);
 return <dialog ref={ref} aria-label={title} className={styles.toolDialog} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>{children}</dialog>;
}
