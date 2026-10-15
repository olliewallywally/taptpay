import {SseBroker} from '../sse-broker';
test('replayed event identity reaches each connection once and a late capture stays merchant-only',async()=>{
  const broker=new SseBroker(),merchant={write:jest.fn()},board={write:jest.fn()};
  broker.subscribe(7,{kind:'merchant',userId:1,principal:'user'},merchant);
  broker.subscribe(7,{kind:'board',stoneId:3},board);
  merchant.write.mockClear();board.write.mockClear();
  const event={type:'transaction_updated',eventId:'11111111-1111-4111-8111-111111111111',merchantOnly:true,transaction:{id:12,status:'completed',price:'1.00',taptStoneId:3}};
  await broker.broadcast(7,3,event);await broker.broadcast(7,3,event);
  expect(merchant.write).toHaveBeenCalledTimes(1);expect(merchant.write.mock.calls[0][0]).toContain(event.eventId);
  expect(board.write).not.toHaveBeenCalled();
});
