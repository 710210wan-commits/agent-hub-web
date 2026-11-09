import {useState} from 'react';
import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {ToolArguments,createArgumentTemplate} from './tool-arguments';
const schema={type:'object',properties:{title:{type:'string'},data:{type:'array',items:{type:'object',properties:{category:{type:'string'},value:{type:'number'}},required:['category','value']}}},required:['data']};
function Harness(){const [value,setValue]=useState('{}');return <><ToolArguments schema={schema} value={value} onChange={setValue}/><output data-testid="payload">{value}</output></>;}
describe('tool argument form',()=>{
 it('loads example rows and edits numeric data without writing JSON',()=>{
  render(<Harness/>);fireEvent.click(screen.getByText('填入示例模板'));
  expect(screen.getByLabelText('分类 · 第1行')).toHaveValue('示例一');
  fireEvent.change(screen.getByLabelText('数值 · 第1行'),{target:{value:'42'}});
  expect(JSON.parse(screen.getByTestId('payload').textContent!).data[0]).toEqual({category:'示例一',value:42});
  fireEvent.click(screen.getByText('添加一行'));
  expect(JSON.parse(screen.getByTestId('payload').textContent!).data).toHaveLength(3);
 });
 it('does not include invalid null defaults or guess complex union values',()=>{
  expect(createArgumentTemplate({properties:{query:{type:'string',default:null},count:{type:'integer',default:5},choice:{anyOf:[{type:'string'},{type:'array'}]}},required:['query']})).toEqual({query:'',count:5});
 });
});
