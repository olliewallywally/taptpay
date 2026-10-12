import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { isSessionId } from "./durable-payment-contract";

/** Mount before global body parsers. R2 supplies extraction for the documented
 * provider format; this module does not guess aliases or trust outcome fields. */
export function createDurablePaymentNotificationHandlers(
  repository: {receive(sessionId:string,kind:"fprn"):Promise<string>},
  extractSession: (body: unknown) => unknown,
) {
  const validate:RequestHandler=(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST') {res.setHeader('Allow','POST');res.status(405).send('Method not allowed');return;}
    if(req.body!==undefined) {res.status(503).send('Notification parser unavailable');return;}
    if(!req.is('application/json') && !req.is('application/x-www-form-urlencoded')) {res.status(415).send('Unsupported media type');return;}
    if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity') {res.status(415).send('Unsupported encoding');return;}
    next();
  };
  const receive:RequestHandler=async(req,res)=>{
    let session:unknown;
    try {session=extractSession(req.body);} catch {res.status(400).send('Invalid notification');return;}
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
  return [validate,express.json({limit:8192,strict:true,inflate:false}),
    express.urlencoded({limit:8192,extended:false,parameterLimit:20,inflate:false}),receive,errorHandler];
}
