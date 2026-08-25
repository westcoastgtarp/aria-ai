function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      ...(init.headers||{})
    }
  });
}

const plans=[
  {code:'free',name:'Aria Free',price:'$0',priceCents:0,billingInterval:null,status:'available'},
  {code:'lifeline_weekly',name:'Aria Lifeline',price:'$4.99/week',priceCents:499,billingInterval:'weekly',status:'payment_not_connected'},
  {code:'lifeline_monthly',name:'Aria Lifeline',price:'$19.99/month',priceCents:1999,billingInterval:'monthly',status:'payment_not_connected'}
];

export async function handleMemberMembershipOptionsRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/member/membership-options'&&request.method==='GET'){
    return json({ok:true,plans,trialDays:30,trainingFirst:true});
  }
  if(url.pathname==='/api/member-signup/config'&&request.method==='GET'){
    return json({
      ok:true,
      consentVersion:'2026-08-20-v1',
      emailDelivery:env.EMAIL&&typeof env.EMAIL.send==='function'?'connected':'not_connected',
      trainingFirst:true,
      trialDays:30,
      plans
    });
  }
  return null;
}
