import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { isSessionId } from "./durable-payment-contract";

/** R3 integration: a fixed-window count per caller address, in process, in addition to any
 * infrastructure limit. Windcave retries a notification it could not deliver. */
export class NotificationRateLimiter {
  private readonly counters=new Map<string,{count:number;resetAt:number}>();
  constructor(readonly windowMs=60_000,private readonly limit=120){}
  allow(key:string,now=Date.now()):boolean{
    const current=this.counters.get(key);
    if(!current || current.resetAt<=now){
      this.counters.set(key,{count:1,resetAt:now+this.windowMs});
      if(this.counters.size>=1000)for(const [name,counter] of this.counters)if(counter.resetAt<=now)this.counters.delete(name);
      return true;
    }
    if(current.count>=this.limit)return false;
    current.count++;return true;
  }
}

/** Mount before global body parsers. R2 supplies extraction for the documented
 * provider format; this module does not guess aliases or trust outcome fields. */
export function createDurablePaymentNotificationHandlers(
  repository: {receive(sessionId:string,kind:"fprn"):Promise<string>},
  extractSession: (body: unknown) => unknown,
  options:{allowGet?:boolean;limiter?:NotificationRateLimiter}={},
) {
  const validate:RequestHandler=(req,res,next)=>{
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    if(req.method!=='POST' && !(options.allowGet && req.method==='GET')) {res.setHeader('Allow',options.allowGet?'GET, POST':'POST');res.status(405).send('Method not allowed');return;}
    if(req.body!==undefined) {res.status(503).send('Notification parser unavailable');return;}
    if(options.limiter && !options.limiter.allow(req.ip || 'unknown')) {
      res.setHeader('Retry-After',String(Math.ceil(options.limiter.windowMs/1000)));res.status(429).send('Too many notifications');return;
    }
    if(req.method==='GET') {
      if(req.originalUrl.length>8192 || Object.keys(req.query).length>20) {res.status(413).send('Invalid notification');return;}
      if(req.headers['transfer-encoding'] || Number(req.headers['content-length']??0)>0) {res.status(400).send('Invalid notification');return;}
      next();return;
    }
    if(!req.is('application/json') && !req.is('application/x-www-form-urlencoded')) {res.status(415).send('Unsupported media type');return;}
    if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity') {res.status(415).send('Unsupported encoding');return;}
    next();
  };
  const receive:RequestHandler=async(req,res)=>{
    let session:unknown;
    try {session=extractSession(req.method==='GET'?req.query:req.body);} catch {res.status(400).send('Invalid notification');return;}
    if(!isSessionId(session)) {res.status(400).send('Invalid notification');return;}
    try {
      await repository.receive(session,'fprn');
      res.status(200).send('OK');
    } catch {
      res.setHeader('Retry-After','5');res.status(503).send('Receipt unavailable');
    }
  };
  const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{
    const status=error?.type==='entity.too.large' || error?.type==='parameters.too.many' ? 413 : 400;
    res.status(status).send('Invalid notification');
  };
  const json=express.json({limit:8192,strict:true,inflate:false});
  const form=express.urlencoded({limit:8192,extended:false,parameterLimit:20,inflate:false});
  const parseJson:RequestHandler=(req,res,next)=>req.method==='GET'?next():json(req,res,next);
  const parseForm:RequestHandler=(req,res,next)=>req.method==='GET'?next():form(req,res,next);
  return [validate,parseJson,parseForm,receive,errorHandler];
}
