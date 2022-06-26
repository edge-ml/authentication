// const Config = require('config');
// const config = Config.get('server');
// const secret = process.env.SECRET || config.secret;
const Model = require("../models/userModel").model;
const stripe = require('stripe')('sk_test_51L7KlPAI18ryOlAQVK2aeFJDxgLJ4I2LQXrTjyaZ1b5z1WK9fx5CoCDtpcqXzXXBUEbgJ1fzSinKMm25mvW09MBX00UmHwIuGO')

const devProductId = 'prod_LsnRY5KYEfIGyc';
const proProductId = 'prod_LsmoNI2tskuI3R';
const proPlusProductId = 'prod_Loys2WqALki7gR';

async function getCustomerId(ctx, passport) {
    await passport.authenticate("jwt", async (err, user, info) => {
        if (info) {
            ctx.body = { error: "Unauthorized" };
            ctx.status = 401;
            return ctx;
        }
        const customer = await Model.findById({ _id: user._id });
        if (!customer.customerId) {
            await registerCustomer(customer.email, customer.userName, customer);
            await customer.save();
        }
        console.log(customer)
        ctx.body = { customerId: customer.customerId };
        ctx.status = 200;
    })(ctx);
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
        // case 'customer.subscription.deleted':
        //     subscription = event.data.object;
        //     status = subscription.status;
        //     console.log(`Subscription status is ${status}.`);
        //     // Then define and call a method to handle the subscription deleted.
        //     // handleSubscriptionDeleted(subscriptionDeleted);
        //     break;
        case 'customer.subscription.created':
            console.log(`Subscription created, status is ${status}.`);
            handleSubscription(subscription);
            break;
        case 'customer.subscription.updated':
            console.log(`Subscription updated, status is ${status}.`);
            handleSubscription(subscription);
            break;
        default:
            // Unexpected event type
            console.log(`Unhandled event type ${event.type}.`);
    }
    // Return a 200 response to acknowledge receipt of the event
    ctx.status = 200;
    return ctx;
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
    });
    userModel.customerId = customer.id;
}

async function handleSubscription(subscription) {
    const status = subscription.status;
    const customerId = subscription.customer;
    const productId = subscription.plan.product;
    if (status !== 'active') {
        return;
    }
    const user = await Model.findOne({ customerId: customerId });
    if (!user) {
        console.error(`Customer not found, customerId: ${customerId}, subscription information:`);
        console.error(subscription)
        return;
    }
    user.subscriptionLevel = getSubscriptionLevel(productId);
    await user.save();
}

function getSubscriptionLevel(productId) {
    if (productId === devProductId) {
        return 'standard';
    } else if (productId === proProductId) {
        return 'upgraded';
    } else if (productId === proPlusProductId) {
        return 'unlimited';
    }
    throw "Product id is not recognized";
}

module.exports = {
    handleWebhookEvent,
    registerCustomer,
    getCustomerId
}