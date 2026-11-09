"use client";
import {useSearchParams} from 'next/navigation';
import {parseMode} from '@/config/modes';
import {McpConsole} from './mcp-console';
export function McpModeConsole(){
 const params=useSearchParams();
 const mode=parseMode(params.get('mode'));
 // Closing dialogs and resetting drafts prevents actions on the previous mode.
 return <McpConsole key={mode} mode={mode}/>;
}
