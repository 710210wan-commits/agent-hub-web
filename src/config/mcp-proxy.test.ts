import {it,expect} from 'vitest';
import {resolveMcpRewrites} from './mcp-proxy';
it('legacy MCP_API_ORIGIN cannot reopen direct Console proxy',()=>{
 for(const value of [undefined,'http://127.0.0.1:4318','http://mcp-api:4318'])expect(resolveMcpRewrites({MCP_API_ORIGIN:value})).toEqual([]);
});
