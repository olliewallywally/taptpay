import type {Request,Response,RequestHandler} from 'express';
import {z} from 'zod';
import type {ConfiguredPaymentRuntime} from './payment-runtime';
import {DurableInvoiceCheckout} from './durable-invoice-checkout';
import {createPaymentReturnState} from './payment-token';
import {isSessionId} from './durable-payment-contract';
import {selectSessionLinks,type SessionLinks} from './windcave-links';
import {normalizeSessionQuery} from './windcave-query';
import {submitGooglePayToken} from './windcave';
import {sessionRequestNotSent} from './windcave-client';
import {config} from './config';

type Invoice={id:string;merchantId:number;checkoutVertical?:'property'|'trades';status:string;splitCount?:number|null;splitPaidCount?:number|null;amountCents:number};
const openSchema=z.object({idempotencyKey:z.string().uuid(),shareIndex:z.number().int().min(0).max(12),reserveShare:z.boolean().optional(),payerEmail:z.string().trim().email().max(254).optional()}).strict();
const completeSchema=z.object({idempotencyKey:z.string().uuid(),shareIndex:z.number().int().min(0).max(12),sessionId:z.string().refine(isSessionId),
  paymentMethod:z.enum(['card','apple_pay']).optional(),googlePayToken:z.record(z.unknown()).optional()}).strict();
const pending=(res:Response)=>res.status(202).json({approved:false,outcome:'pending',processing:true,message:'Payment is still being confirmed. Keep this payment open.'});
const result=(state:string)=>({approved:state==='approved',outcome:['approved','declined','cancelled'].includes(state)?state:'pending'});
function linksFromBody(body:unknown,sessionId:string,mode:'uat'|'production'):SessionLinks {
  if(!body || typeof body!=='object' || (body as any).id!==sessionId || !Array.isArray((body as any).links))return {};
  const rows=(body as any).links.filter((row:any)=>row && typeof row.rel==='string' && typeof row.href==='string');
  return selectSessionLinks(rows,mode).links;
}

export function createInvoiceCheckoutHandlers(deps:{runtime?:ConfiguredPaymentRuntime;
  getCheckoutInvoiceByToken:(token:string)=>Promise<Invoice|undefined>;customerEmail:(invoice:Invoice)=>Promise<string>;
  baseUrl:(req:Request)=>string;checkRateLimit:(token:string)=>boolean}) {
  const {runtime}=deps;
  const session:RequestHandler=async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!deps.checkRateLimit(req.params.token)){res.status(429).json({message:'Too many requests'});return;}
    const parsed=openSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'Invalid payment session request'});return;}
    try {
      const invoice=await deps.getCheckoutInvoiceByToken(req.params.token);if(!invoice){res.status(404).json({message:'Payment link not found'});return;}
      if(!runtime || !config.paymentReturnStateSecret){res.status(503).json({message:'Payment initiation is unavailable'});return;}
      const base=deps.baseUrl(req),vertical=invoice.checkoutVertical==='trades'?'trades':'property';
      const customerEmail=await deps.customerEmail(invoice);
      const checkout=new DurableInvoiceCheckout(runtime.repository,{create:async(expected,raw)=>{
        const reply=await runtime.client.createSession({xId:expected.processorXId,amount:(expected.amountCents/100).toFixed(2),
          merchantReference:expected.reference,customerEmail,callbackBase:`${base}/api/checkout/callback?token=${encodeURIComponent(req.params.token)}&state=${raw}`,
          notificationUrl:`${base}/api/windcave/${vertical==='trades'?'trades':'rent'}-notification`});
        if(sessionRequestNotSent(reply))return {kind:'not-sent'};
        const sessionId=reply.kind==='created'?reply.sessionId:reply.kind==='duplicate' && reply.body && typeof reply.body==='object'?(reply.body as any).id:undefined;
        if(!isSessionId(sessionId))return {kind:'unknown'};
        return {kind:'ready',sessionId};
      }},runtime.clock,()=>config.features.invoicePayments && ['uat','production'].includes(config.paymentMode),
        id=>createPaymentReturnState(id,config.paymentReturnStateSecret!).rawToken);
      const claim=await checkout.open({vertical,invoiceId:invoice.id,merchantId:invoice.merchantId,shareIndex:parsed.data.shareIndex,
        idempotencyKey:parsed.data.idempotencyKey,reserveShare:parsed.data.reserveShare,payerEmail:parsed.data.payerEmail?.toLowerCase(),currency:'NZD',
        environment:runtime.context.providerEnvironment,providerAccount:runtime.context.accountUsername});
      if(claim.kind==='terminal') {
        const attempt=await runtime.repository.getInvoiceAttemptByKey({vertical,invoiceId:invoice.id,merchantId:invoice.merchantId,...parsed.data,shareIndex:claim.shareIndex});
        if(!attempt){pending(res);return;}
        res.json({...result(attempt.state),attemptState:attempt.state,shareIndex:attempt.shareIndex});return;
      }
      if(claim.kind==='ready') {
        const binding=await runtime.repository.getInvoiceSession(claim.attemptId);
        const query=await runtime.client.querySession(claim.sessionId);
        const links=query.kind==='reply' && normalizeSessionQuery(query.body,claim.sessionId).kind==='pending'
          ? linksFromBody(query.body,claim.sessionId,runtime.context.providerEnvironment):{};
        if(!binding){pending(res);return;}
        if(!links.hpp && !links.ajaxSubmitCard){res.status(202).json({processing:true,outcome:'pending',shareIndex:claim.shareIndex,returnState:claim.rawReturnState});return;}
        res.json({sessionId:claim.sessionId,shareIndex:claim.shareIndex,returnState:claim.rawReturnState,attemptState:'ready',
          amountStr:(binding!.amountCents/100).toFixed(2),hppUrl:links.hpp,ajaxSubmitCardUrl:links.ajaxSubmitCard,
          ajaxSubmitApplePayUrl:links.ajaxSubmitApplePay,ajaxSubmitGooglePayUrl:links.ajaxSubmitGooglePay});return;
      }
      if(claim.kind==='processing'){res.status(202).json({processing:true,outcome:'pending',shareIndex:claim.shareIndex,returnState:claim.rawReturnState});return;}
      if(claim.kind==='closed'){res.status(410).json({code:'PAYMENT_LINK_CLOSED',message:'Payment link is closed'});return;}
      if(claim.kind==='expired'){res.status(409).json({code:'PAYMENT_ATTEMPT_EXPIRED',message:'This payment window expired before it was sent. Try again.'});return;}
      res.status(claim.kind==='not-found'?404:claim.kind==='conflict'?409:503).json({message:claim.kind==='conflict'?'Another payment attempt is active':'Payment initiation is unavailable'});
    }catch {console.error('[INVOICE_SESSION_UNAVAILABLE]');res.status(503).json({message:'Payment session is still being confirmed'});}
  };
  const complete=(wallet=false):RequestHandler=>async(req,res)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(!deps.checkRateLimit(req.params.token)){res.status(429).json({message:'Too many requests'});return;}
    const parsed=completeSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({message:'Invalid payment completion request'});return;}
    try {
      const invoice=await deps.getCheckoutInvoiceByToken(req.params.token);if(!invoice){res.status(404).json({message:'Payment link not found'});return;}
      if(!runtime){pending(res);return;}
      const input={vertical:invoice.checkoutVertical==='trades'?'trades' as const:'property' as const,invoiceId:invoice.id,merchantId:invoice.merchantId,...parsed.data};
      let attempt=await runtime.repository.getInvoiceAttemptByKey(input);
      const binding=attempt?await runtime.repository.getInvoiceSession(attempt.id):undefined;
      if(!attempt || !binding || binding.sessionId!==parsed.data.sessionId){res.status(404).json({message:'Payment session not found'});return;}
      // T-3 interim: a declined attempt is still reconciled, so a later card in its session is never silent.
      if(!['approved','cancelled'].includes(attempt.state)) {
        if(wallet && parsed.data.googlePayToken && config.features.invoicePayments && ['uat','production'].includes(config.paymentMode)){
          const reply=await runtime.client.querySession(binding.sessionId);
          if(reply.kind==='reply' && normalizeSessionQuery(reply.body,binding.sessionId).kind==='pending') {
            const url=linksFromBody(reply.body,binding.sessionId,runtime.context.providerEnvironment).ajaxSubmitGooglePay;
            if(url && await runtime.repository.claimWalletSubmission(binding.sessionId,runtime.clock()))await submitGooglePayToken(url,parsed.data.googlePayToken).catch(()=>undefined);
          }
        }
        await runtime.reconcile(binding.sessionId,'poll');attempt=await runtime.repository.getInvoiceAttemptByKey(input);
      }
      if(!attempt || !['approved','declined','cancelled'].includes(attempt.state)){pending(res);return;}
      const fresh=await deps.getCheckoutInvoiceByToken(req.params.token);
      res.json({...result(attempt.state),receiptShare:attempt.shareIndex||null,splitCount:fresh?.splitCount??null,splitPaidCount:fresh?.splitPaidCount??0});
    }catch {console.error('[INVOICE_COMPLETION_UNAVAILABLE]');pending(res);}
  };
  const callback:RequestHandler=async(req,res)=>{
    const token=typeof req.query.token==='string'?req.query.token:undefined,state=typeof req.query.state==='string'?req.query.state:undefined;
    if(!token){res.status(404).json({message:'Payment return not found'});return;}
    if(!deps.checkRateLimit(token)){res.status(429).json({message:'Too many requests'});return;}
    try {
      const invoice=await deps.getCheckoutInvoiceByToken(token);if(!invoice){res.status(404).json({message:'Payment return not found'});return;}
      if(!state || !runtime){res.status(409).json({message:'This legacy payment needs reconciliation'});return;}
      const found=await runtime.repository.resolveInvoiceReturnState(state,runtime.clock());
      if(found.kind!=='valid' || found.attempt.merchantId!==invoice.merchantId ||
        (invoice.checkoutVertical==='trades'?found.attempt.jobInvoiceId!==invoice.id:found.attempt.rentInvoiceId!==invoice.id)){
        res.status(found.kind==='expired'?410:404).json({message:'Payment return not found'});return;
      }
      if(found.sessionId)await runtime.reconcile(found.sessionId,'browser');
      res.redirect(303,`/r/${encodeURIComponent(token)}?paymentState=${encodeURIComponent(state)}`);
    }catch {res.status(503).json({message:'Payment return is still being confirmed'});}
  };
  const split:RequestHandler=async(req,res)=>{
    if(!deps.checkRateLimit(req.params.token)){res.status(429).json({message:'Too many requests'});return;}
    const parsed=z.object({count:z.number().int().min(2).max(12)}).strict().safeParse(req.body);
    if(!parsed.success){res.status(400).json({message:'Invalid split count'});return;}
    try {
      const invoice=await deps.getCheckoutInvoiceByToken(req.params.token);if(!invoice){res.status(404).json({message:'Payment link not found'});return;}
      if(!runtime){res.status(503).json({message:'Split configuration is unavailable'});return;}
      const change=await runtime.repository.changeInvoice({vertical:invoice.checkoutVertical==='trades'?'trades':'property',invoiceId:invoice.id,
        merchantId:invoice.merchantId,action:'split',splitCount:parsed.data.count},runtime.clock());
      if(change.kind==='conflict' || change.kind==='not-found'){res.status(change.kind==='not-found'?404:409).json({message:'The split cannot change while a payment is active'});return;}
      res.json({splitCount:parsed.data.count,splitPaidCount:0,shareCents:Math.floor(invoice.amountCents/parsed.data.count)});
    }catch {res.status(503).json({message:'Split configuration is unavailable'});}
  };
  return {session,complete,callback,split};
}
