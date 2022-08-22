// const Config = require('config');
// const config = Config.get('server');
// const secret = process.env.SECRET || config.secret;
const Model = require("../models/userModel").model;
const stripe = require('stripe')('sk_test_51L7KlPAI18ryOlAQVK2aeFJDxgLJ4I2LQXrTjyaZ1b5z1WK9fx5CoCDtpcqXzXXBUEbgJ1fzSinKMm25mvW09MBX00UmHwIuGO')

const devSubLevel = 'standard';
const proSubLevel = 'upgraded';
const proPlusSubLevel = 'unlimited';

const devProductId = 'prod_LsnRY5KYEfIGyc';
const proProductId = 'prod_LsmoNI2tskuI3R';
const proPlusProductId = 'prod_Loys2WqALki7gR';

const YOUR_DOMAIN = 'http://localhost:3000';

async function getCustomerId(ctx, passport) {
    await passport.authenticate("jwt", async (err, user, info) => {
        if (info) {
            ctx.body = { error: "Unauthorized" };
            ctx.status = 401;
            return ctx;
        }
        const customer = await Model.findById({ _id: user._id });
        // should be checked against stripe servers if the database is to be kept consistent
        if (!customer.customerId) {
            await registerCustomer(customer.email, customer.userName, customer);
            await customer.save();
        }
        console.log(customer)
        ctx.body = { customerId: customer.customerId };
        ctx.status = 200;
    })(ctx);
}

async function getProducts(ctx) {
    const productList = await stripe.products.list({ active: true });
    const products = productList.data.map(p => ({
        priceId: p.default_price,
        details: p.metadata // pricing manually put in metadata, may conflict with actual price if not updated accordingly
    }))
    ctx.body = products;
    ctx.status = 200;
    return ctx;
}

async function handleWebhookEvent(ctx) {
    console.log("webhook...")
    let event = ctx.request.rawBody;
    // Replace this endpoint secret with your endpoint's unique secret
    // If you are testing with the CLI, find the secret by running 'stripe listen'
    // If you are using an endpoint defined with the API or dashboard, look in your webhook settings
    // at https://dashboard.stripe.com/webhooks
    const endpointSecret = 'whsec_0621e1e121cd8987b721a65113613fc16f701f5d3245aa276e2ea74e89c8591b';
    // Only verify the event if you have an endpoint secret defined.
    // Otherwise use the basic event deserialized with JSON.parse
    if (endpointSecret) {
        // Get the signature sent by Stripe
        const signature = ctx.request.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(
                ctx.request.rawBody,
                signature,
                endpointSecret
            );
        } catch (err) {
            console.log(`⚠️  Webhook signature verification failed.`, err.message);
            ctx.status = 400;
            return ctx;
        }
    }
    const subscription = event.data.object;
    const status = subscription.status;
    // Handle the event
    switch (event.type) {
        case 'customer.subscription.deleted':
            console.log(`Subscription deleted, status is ${status}.`);
            handleSubscriptionDeleted(subscription);
            break;
        case 'customer.subscription.created':
            console.log(`Subscription created, status is ${status}.`);
            handleSubscriptionCreated(subscription);
            break;
        case 'customer.subscription.updated':
            console.log(`Subscription updated, status is ${status}.`);
            handleSubscriptionUpdated(subscription);
            break;
        default:
        // Unexpected event type
        // console.log(`Unhandled event type ${event.type}.`);
        // console.log(event)
    }
    // Return a 200 response to acknowledge receipt of the event
    ctx.status = 200;
    return ctx;
}

async function createCheckoutSession(ctx, passport) {
    await passport.authenticate("jwt", async (err, user, info) => {
        if (info) {
            ctx.body = { error: "Unauthorized" };
            ctx.status = 401;
            return ctx;
        }
        const priceId = ctx.request.body.priceId;
        const customerId = ctx.request.body.customerId;
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${YOUR_DOMAIN}/payment?success=true?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${YOUR_DOMAIN}/payment?canceled=true`,
            customer: customerId,
        });
        ctx.body = { redirectUrl: session.url }
        ctx.status = 200;
        return ctx;
    })(ctx);
}

async function createPortalSession(ctx, passport) {
    await passport.authenticate("jwt", async (err, user, info) => {
        if (info) {
            ctx.body = { error: "Unauthorized" };
            ctx.status = 401;
            return ctx;
        }
        const configuration = await stripe.billingPortal.configurations.create({
            features: {
                customer_update: {
                    enabled: false,
                },
                invoice_history: { enabled: true },
                payment_method_update: { enabled: true },
                subscription_cancel: {
                    enabled: true,
                    mode: 'at_period_end',
                    cancellation_reason: {
                        enabled: true,
                        options: [
                            'too_expensive',
                            'missing_features',
                            'switched_service',
                            'unused',
                            'customer_service',
                            'too_complex',
                            'low_quality',
                            'other'
                        ]
                    },
                },
                subscription_pause: { enabled: false },
                subscription_update: {
                    enabled: true,
                    default_allowed_updates: ['price'],
                    products: [
                        { product: 'prod_Loys2WqALki7gR', prices: ['price_1L7KuJAI18ryOlAQr9RuO7As'] }, // pro+
                        { product: 'prod_LsmoNI2tskuI3R', prices: ['price_1LB1EoAI18ryOlAQ3r3GktSV'] } // pro
                    ],
                    proration_behavior: 'create_prorations',
                }
            },
            business_profile: {
                privacy_policy_url: YOUR_DOMAIN,
                terms_of_service_url: YOUR_DOMAIN,
            }
        })
        const customerId = ctx.request.body.customerId;
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: YOUR_DOMAIN,
            configuration: configuration.id,
        });
        ctx.body = { redirectUrl: session.url };
        ctx.status = 200;
    })(ctx);
}

/**
 * creates a new customer in stripe
 * sets customerId of the given userModel
 * storing of the userModel is delegated to the caller
 */
async function registerCustomer(email, name, userModel) {
    const customer = await stripe.customers.create({
        email: email,
        name: name,
        test_clock: "clock_1LYUWCAI18ryOlAQnGAArbtq", // for testing purposes, remove in production
    });
    userModel.customerId = customer.id;
}

// TODO: check first time subscriptions if the subscription updated event is triggered
//       check the behaviour of downgrades/upgrades to subscription level
//       find a solution to log out after issuing new jwt
//       fix jwt expiration time

async function handleSubscriptionCreated(subscription) {
    // await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
}

async function handleSubscriptionUpdated(subscription) {
    const status = subscription.status;
    const customerId = subscription.customer;
    const productId = subscription.plan.product;
    console.log('\n\nHandling update event\n\n');
    console.log(subscription)
    console.log(status)
    if (status !== 'active') {
        return;
    }
    const user = await Model.findOne({ customerId: customerId });
    console.log('current userLevel is: ' + user.subscriptionLevel);
    console.log('next userLevel will be: ' + getSubscriptionLevel(productId));
    if (!user) {
        console.error(`Customer not found, customerId: ${customerId}, subscription information:`);
        console.error(subscription)
        return;
    }
    user.subscriptionLevel = getSubscriptionLevel(productId);
    await user.save();
}

async function handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    const user = await Model.findOne({ customerId: customerId });
    if (!user) {
        console.error(`Customer not found, customerId: ${customerId}, subscription information:`);
        console.error(subscription)
        return;
    }
    user.subscriptionLevel = devSubLevel;
    await user.save();
}

function getSubscriptionLevel(productId) {
    if (productId === devProductId) {
        return devSubLevel;
    } else if (productId === proProductId) {
        return proSubLevel;
    } else if (productId === proPlusProductId) {
        return proPlusSubLevel;
    }
    throw "Product id is not recognized";
}

module.exports = {
    handleWebhookEvent,
    registerCustomer,
    getCustomerId,
    getProducts,
    createCheckoutSession,
    createPortalSession,
}