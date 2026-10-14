import type {Request,Response,RequestHandler} from 'express';
import {z} from 'zod';
import type {IStorage} from './storage';
import type {PaymentAttemptService} from './payment-attempt-service';
import type {ConfiguredPaymentRuntime} from './payment-runtime';
import {DurableRetailCheckout} from './durable-retail-checkout';
import {resolvePaymentToken} from './payment-token';
import {strictPositiveIntegerParam} from './http-params';
import {parseCentsExact,normalizeSessionQuery} from './windcave-query';
import {isSessionId} from './durable-payment-contract';
import {config} from './config';
import {selectSessionLinks} from './windcave-links';
import {submitGooglePayToken} from './windcave';

const sessionSchema=z.object({idempotencyKey:z.string().uuid(),shareIndex:z.number().int().min(0).max(10),
  merchantId:z.number().int().positive().optional(),stoneId:z.number().int().positive().nullable().optional(),
  amount:z.string().regex(/^\d+(\.\d{1,2})?$/).optional()}).strict();
const completeSchema=z.object({idempotencyKey:z.string().uuid(),shareIndex:z.number().int().min(0).max(10),
  sessionId:z.string().refine(isSessionId),paymentMethod:z.enum(['card','apple_pay']).optional(),googlePayToken:z.record(z.unknown()).optional()}).strict();
const outcome=(attempt:{state:string;receiptShare:number|null})=>({approved:attempt.state==='approved',
  outcome:['approved','declined','cancelled'].includes(attempt.state)?attempt.state:'pending',receiptShare:attempt.receiptShare??null});
const processing=(res:Response)=>res.status(202).json({approved:false,outcome:'pending',processing:true,message:'Payment is still being confirmed. Keep this payment open.'});

export function createRetailCheckoutHandlers(deps:{storage:IStorage;attempts:PaymentAttemptService;runtime?:ConfiguredPaymentRuntime;
  baseUrl:(req:Request)=>string;checkRateLimit:(req:Request,res:Response,family:'session'|'completion'|'resolve')=>boolean}) {
  const {storage,attempts,runtime}=deps;
  const find=async(req:Request,token:boolean)=>{
    if(token)return resolvePaymentToken(storage,req.params.token);
    const id=strictPositiveIntegerParam(req.params.id);if(id===null)return undefined;
    const sale=await storage.getTransaction(id);return sale && sale.paymentTokenHash==null? sale:undefined;
  };
  const session=(token:boolean):RequestHandler=>async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!token && strictPositiveIntegerParam(req.params.id)===null){res.status(400).json({message:'Invalid id'});return;}
    if(!deps.checkRateLimit(req,res,'session'))return;
    try {
      const sale=await find(req,token);if(!sale){res.status(404).json({message:'Payment link not found'});return;}
      const parsed=sessionSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'Invalid payment session request'});return;}
      const input=parsed.data;
      if((input.merchantId!==undefined && input.merchantId!==sale.merchantId) ||
        (input.stoneId!==undefined && input.stoneId!==sale.taptStoneId)){res.status(403).json({message:'Transaction verification failed'});return;}
      if(input.stoneId){const stone=await storage.getTaptStoneForMerchant(input.stoneId,sale.merchantId!);if(!stone){res.status(403).json({message:'Invalid stone verification'});return;}}
      const splits=sale.isSplit?await storage.getSplitPaymentsByTransaction(sale.id):[];
      const split=splits.find(row=>row.splitIndex===input.shareIndex);
      if(sale.isSplit?!split:input.shareIndex!==0){res.status(409).json({message:'Payment share is not payable'});return;}
      if(input.amount!==undefined){const request=parseCentsExact(input.amount),expected=parseCentsExact(split?.amount??sale.price);
        if(!request.ok || !expected.ok || request.cents!==expected.cents){res.status(400).json({message:'Payment amount does not match the share'});return;}}
      if(!runtime || !config.paymentReturnStateSecret){res.status(503).json({code:'PAYMENT_PROVIDER_UNAVAILABLE',message:'Payment initiation is temporarily unavailable'});return;}
      const merchant=await storage.getMerchant(sale.merchantId!);if(!merchant){res.status(404).json({message:'Payment link not found'});return;}
      const base=deps.baseUrl(req);
      const checkout=new DurableRetailCheckout(attempts,runtime.repository,runtime.client,runtime.context,
        config.paymentReturnStateSecret,runtime.clock,()=>config.features.newRetailPayments && ['uat','production'].includes(config.paymentMode));
      const result=await checkout.open({transactionId:sale.id,merchantId:sale.merchantId!,shareIndex:input.shareIndex,
        idempotencyKey:input.idempotencyKey,customerEmail:merchant.email??'customer@taptpay.co.nz',callbacks:raw=>({
          callbackBase:token?`${base}/api/pay/return/${raw}?source=hpp`:`${base}/api/windcave/callback?state=${raw}&transactionId=${sale.id}`,
          notificationUrl:`${base}/api/windcave/notification`})});
      if(result.kind==='ready'){res.json({sessionId:result.sessionId,shareIndex:result.shareIndex,returnState:result.returnState,attemptState:'ready',
        hppUrl:result.links.hpp,ajaxSubmitCardUrl:result.links.ajaxSubmitCard,ajaxSubmitApplePayUrl:result.links.ajaxSubmitApplePay,ajaxSubmitGooglePayUrl:result.links.ajaxSubmitGooglePay});return;}
      if(result.kind==='terminal'){res.json({...result,approved:result.outcome==='approved',attemptState:result.outcome});return;}
      if(result.kind==='processing'){res.status(202).json({...result,outcome:'pending',processing:true});return;}
      if(result.kind==='expired'){res.status(409).json({code:'PAYMENT_ATTEMPT_EXPIRED',message:'This payment window expired before it was sent. Try again.'});return;}
      res.status(result.kind==='not-found'?404:result.kind==='conflict'?409:503).json({message:result.kind==='conflict'?'Another payment attempt is active':'Payment initiation is unavailable'});
    }catch {console.error('[RETAIL_SESSION_UNAVAILABLE]');res.status(503).json({message:'Payment session is still being confirmed'});}
  };
  const complete=(token:boolean,wallet=false):RequestHandler=>async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!token && strictPositiveIntegerParam(req.params.id)===null){res.status(400).json({message:'Invalid id'});return;}
    if(!deps.checkRateLimit(req,res,'completion'))return;
    if(!token && !req.body?.sessionId){res.status(400).json({message:'sessionId required'});return;}
    try {
      const sale=await find(req,token);if(!sale){res.status(404).json({message:'Payment link not found'});return;}
      const parsed=completeSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'Invalid payment completion request'});return;}
      const attempt=await attempts.getAttemptByTransactionShareKey({transactionId:sale.id,...parsed.data});
      if(!attempt || attempt.processorSessionId!==parsed.data.sessionId){res.status(404).json({message:'Payment session not found'});return;}
      if(['approved','declined','cancelled'].includes(attempt.state)){res.json(outcome(attempt));return;}
      if(!runtime){processing(res);return;}
      // A submitted wallet token is not financial evidence. Wallet submission
      // is performed only by its durable once-only send command, then queried.
      if(wallet && parsed.data.googlePayToken && config.features.newRetailPayments && ['uat','production'].includes(config.paymentMode)) {
        const query=await runtime.client.querySession(parsed.data.sessionId);
        const body=query.kind==='reply' && query.body && typeof query.body==='object'?query.body as Record<string,unknown>:undefined;
        if(body?.id===parsed.data.sessionId && normalizeSessionQuery(body,parsed.data.sessionId).kind==='pending' && Array.isArray(body.links)) {
          const rows=body.links.filter((row:any)=>row && typeof row.rel==='string' && typeof row.href==='string');
          const url=selectSessionLinks(rows,runtime.context.providerEnvironment).links.ajaxSubmitGooglePay;
          if(url && await runtime.repository.claimWalletSubmission(parsed.data.sessionId,runtime.clock()))
            await submitGooglePayToken(url,parsed.data.googlePayToken).catch(()=>undefined);
        }
      }
      await runtime.reconcile(parsed.data.sessionId,'poll');
      const current=await attempts.getAttempt(attempt.id);
      if(!current || !['approved','declined','cancelled'].includes(current.state)){processing(res);return;}
      res.json(outcome(current));
    }catch {console.error('[RETAIL_COMPLETION_UNAVAILABLE]');processing(res);}
  };
  const returnState:RequestHandler=async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!deps.checkRateLimit(req,res,'resolve'))return;
    const providerReturn=req.query.source==='hpp' || req.query.result!==undefined;
    try {
      const resolved=await attempts.resolveReturnState(req.params.state);
      if(resolved.kind==='not-found'){
        const invoice=await runtime?.repository.resolveInvoiceReturnState(req.params.state,runtime.clock());
        if(invoice?.kind==='expired'){res.status(410).json({message:'Payment return has expired'});return;}
        if(invoice?.kind==='valid'){
          if(invoice.sessionId && !['approved','declined','cancelled'].includes(invoice.attempt.state))await runtime!.reconcile(invoice.sessionId,'browser');
          const current=await runtime!.repository.resolveInvoiceReturnState(req.params.state,runtime!.clock());
          const attempt=current.kind==='valid'?current.attempt:invoice.attempt;
          res.json({...outcome({state:attempt.state,receiptShare:attempt.shareIndex||null}),invoiceId:attempt.rentInvoiceId??attempt.jobInvoiceId});return;
        }
        res.status(404).json({message:'Payment return not found'});return;
      }
      if(resolved.kind==='expired'){res.status(410).json({message:'Payment return has expired'});return;}
      if(runtime && resolved.attempt.processorSessionId && !['approved','declined','cancelled'].includes(resolved.attempt.state))
        await runtime.reconcile(resolved.attempt.processorSessionId,'browser');
      if(providerReturn){res.redirect(303,`/pay/return/${encodeURIComponent(req.params.state)}`);return;}
      const current=await attempts.getAttempt(resolved.attempt.id),sale=await storage.getTransaction(resolved.attempt.transactionId);
      const final=outcome(current??resolved.attempt);
      const receiptSplitId=sale && sale.paymentTokenHash==null && final.approved && final.receiptShare
        ? (await storage.getSplitPaymentsByTransaction(sale.id)).find(split=>split.splitIndex===final.receiptShare)?.id : null;
      res.json({...final,...(sale && sale.paymentTokenHash==null?{transactionId:sale.id,receiptSplitId:receiptSplitId??null}:{})});
    }catch {console.error('[PAYMENT_RETURN_UNAVAILABLE]');processing(res);}
  };
  const numericReturn:RequestHandler=async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!deps.checkRateLimit(req,res,'resolve'))return;
    if(Object.keys(req.query).some(key=>key.toLowerCase()==='sim')){res.status(400).json({message:'Invalid request'});return;}
    const id=typeof req.query.transactionId==='string'?strictPositiveIntegerParam(req.query.transactionId):null;
    const state=typeof req.query.state==='string'?req.query.state:undefined;
    if(id===null){res.status(404).json({message:'Payment return not found'});return;}
    try {
      const sale=await storage.getTransaction(id);
      if(!sale || sale.paymentTokenHash!=null){res.status(404).json({message:'Payment return not found'});return;}
      if(!state){res.status(409).json({message:'This legacy payment needs reconciliation'});return;}
      const resolved=await attempts.resolveReturnState(state);
      if(resolved.kind!=='resolved' || resolved.attempt.transactionId!==id){res.status(resolved.kind==='expired'?410:404).json({message:'Payment return not found'});return;}
      if(runtime && resolved.attempt.processorSessionId)await runtime.reconcile(resolved.attempt.processorSessionId,'browser');
      const current=await attempts.getAttempt(resolved.attempt.id);
      const result=outcome(current??resolved.attempt);
      res.redirect(303,result.approved?`/receipt/${id}${result.receiptShare?`?splitId=${(await storage.getSplitPaymentsByTransaction(id)).find(row=>row.splitIndex===result.receiptShare)?.id??''}`:''}`:
        `/payment/result/${id}?state=${encodeURIComponent(state)}`);
    }catch {res.redirect(303,`/payment/result/${id}?state=${encodeURIComponent(state??'')}`);}
  };
  return {session,complete,returnState,numericReturn};
}
