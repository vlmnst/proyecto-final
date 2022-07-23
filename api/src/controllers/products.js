const Product = require('../models/Product');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { cloudinary } = require('../utils/cloudinary.jsx');


const getAllProducts = async (req, res, next) => {
    try {
        const products = await Product.find({})
        return res.json(products);
    } catch (error) {
        return next(error);
    };
};

const totalProducts = async (req, res, next) => {

    try {
        let result = await Product.count();
        return res.json({ result });
    } catch (error) {
        return next(error);
    };
};

const saveAtCloudinary = async ({ img, id }, where) => {

    try {
        let responses = [];

        for (let i = 0; i < img.length; i++) {
            if (img[i] !== 'empty') { // !== 'empty'
                if (where === 'create') await cloudinary.uploader.upload(img[i], { public_id: id + '-' + i });
                if (where === 'modify') {
                    await cloudinary.uploader.destroy({ public_id: id + '-' + i });
                    await cloudinary.uploader.upload(img[i], { public_id: id + '-' + i });
                }
                let response = await cloudinary.api.resource(id + '-' + i);
                responses.push(response.url);
            } else if (img[i] === 'empty') {
                await cloudinary.uploader.destroy({ public_id: id + '-' + i });
            };
        };

        return responses;
    } catch (error) {
        return console.log(error);
    };
};

const createProduct = async (req, res, next) => {

    try {
        const { name, price, category, img, stock, offer, description, detail } = req.body;

        // exists??
        const exists = await Product.find({ name });
        if (exists.length > 0) return res.status(400).json({ error: 'the name of the product exists' });

        const product = new Product({
            name,
            price,
            category,
            img,
            stock,
            soldCount: 0,
            offer: offer ? offer : 0,
            description,
            detail,
            reviews: [],
            queries: [],
            date: new Date(),
        });

        const responses = await saveAtCloudinary(product, 'create');

        product.img = responses;
        await product.save();

        console.log(`. \u2705 product "${name}" created and saved OK`);
        return res.json({ msg: 'product create successfully' });
        // return res.json(product);
    } catch (error) {
        return next(error);
    };
};

const editProduct = async (req, res, next) => {

    try {
        let {
            name,
            price,
            category,
            img,
            stock,
            offer,
            detail,
            description,
        } = req.body;

        const productId = req.params.id

        const product = {
            id: productId,
            img: img,
        }

        const responses = await saveAtCloudinary(product, 'modify');
        img = responses;

        await Product.findOneAndUpdate({ "_id": productId },
            {
                $set: {
                    "name": name,
                    "price": price,
                    "category": category,
                    "img": img,
                    "stock": stock,
                    "offer": offer,
                    "detail": detail,
                    "description": description
                }
            },
            {
                multi: true
            }
        );

        console.log(`. \u2705 product "${name}" updated successfully`);
        return res.json({ msg: "Product updated successfully" });
    } catch (error) {
        return next(error);
    };
};

const deleteProduct = async (req, res, next) => {
    try {
        const { productID } = req.body;

        if (!productID) return res.status(400).json({ error: 'enter product id' });

        let product = await Product.findById(productID);
        await Product.deleteOne({ name: product.name });
        return res.json(product);
    } catch (error) {
        return next(error);
    };
};

const buyProduct = async (req, res, next) => {

    try {
        // cart = [{idProduct1, quantity}, {idProduct2, quantity}, etc]
        const { cart, userID } = req.body;
        const user = await User.findById(userID);

        var outOfStock = 0;
        let promisesStock = cart.map(async (prods) => {
            let productStock = await Product.findById(prods.id);

            if (productStock.stock < prods.quantity) {
                outOfStock++;
            };
        });

        await Promise.all(promisesStock);

        if (outOfStock > 0) return res.status(400).json({ error: `out of stock` });

        let cartProducts = [];
        let totalPrice = 0;

        // mapeo los productos del carrito
        let emptyCart = cart.map(async (prods) => {
            let product = await Product.findById(prods.id);

            let { price, name, offer, img } = product;

            product.stock = product.stock - prods.quantity;
            product.soldCount = product.soldCount + prods.quantity;
            totalPrice = totalPrice + price;
            product.save();

            // agrego uno por uno, cada producto del carrito al 'cartProducts'
            cartProducts.push({
                id: prods.id,
                name,
                price,
                offer,
                img,
                review: false,
                quantity: prods.quantity,
            });
        });

        await Promise.all(emptyCart);

        // creo la orden de compra
        const order = {
            order: uuidv4(),
            date: new Date(),
            total: totalPrice,
            detail: cartProducts,
            idMP:
        };

        user.productsHistory = user.productsHistory.concat(order);
        user.save();

        return res.json(order);
    } catch (error) {
        return next(error);
    };

};

const getProductsByCategory = async (req, res, next) => {
    try {
        let category = req.params.category
        console.log(category)
        if (category) {
            let productsFound = await Product.find({ category: category })
            if (productsFound.length === 0) {
                return res.json('We are sorry, There are no products with the category ' + category)
            }
            if (productsFound.length !== 0)
                return res.json(productsFound);
        }
        else {
            return res.json('The category was not indicated')
        }
    }
    catch (error) {
        return next(error);
    }
};

const getProductsByName = async (req, res, next) => {
    try {
        let name = req.params.name.toLowerCase()
        let products = await Product.find({})
        let productsIncludesName = products.filter(item =>
            item.name?.toLowerCase().includes(name) ||
            item.category?.includes(name) ||
            // item.description.Brand?.toLowerCase().includes(name)
            item.description?.includes(name)
        )
        if (productsIncludesName.length === 0) return res.json({ error: 'We are sorry, we do not have that product, try something else' })
        if (productsIncludesName.length !== 0) return res.json(productsIncludesName);
    } catch (error) {
        return next(error);
    }
};

const getProductsById = async (req, res, next) => {
    try {
        let id = req.params.id
        if (id) {
            let products = await Product.findById(id);
            res.status(200).json(products)
        } else {
            res.json({ error: 'please enter an id' })
        }
    } catch (error) {
        return next(error.detail);
    }
};

const getCategories = async (req, res, next) => {
    try {
        let products = await Product.find({})
        var array = products.map(O => O.category).flat()
        const sin_repetidos = [... new Set(array)]
        res.status(200).json(sin_repetidos);
    } catch (error) {
        console.log(error.message)
    }
};

const putReview = async (req, res, next) => {

    try {
        const { id } = req.params;
        const { review } = req.body; // review: {rating, comment, owner}
        // console.log(req.body)
        // falta ir a buscar al owner y sus productHistory, para agregarle al producto comprado : REVIEW = true

        const addReviewProduct = await Product.updateOne({ "_id": id }, { $push: { "reviews": review } });

        if (addReviewProduct) {
            return res.json({ msg: 'review successfully' })
        } else {
            return res.status(400).json({ error: 'problem adding review in product' });
        };
    } catch (error) {
        return next(error);
    };

};

// const alertarme = async(req, res, next) => {
//     try {
//         return res.json('success')
//     } catch (error) {
//         console.log(error);
//     }
// }

const cartCheckout = async (req, res, next) => {
    const payload = req.body;
    try {
        let newCart = [];
        payload.cart.map(p => {
            let item = { title: p.name, unit_price: p.price, quantity: 1 }
            newCart.push(item);
        });
        const url = "https://api.mercadopago.com/checkout/preferences";
        const body = {
            items: newCart,
            back_urls: {
                failure: "http://localhost:19006",
                pending: "http://localhost:19006",
                success: "http://localhost:19006"
            }
        };
        const payment = await axios.post(url, body, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
            }
        });
        return res.json(payment.data);
    } catch (error) {
        return next(error);
    }
    const webhook = async (req, res, next) => {
        const url = 'https://api.mercadopago.com/v1/payments'
        try{
            response=req.body
            const id =response.data.id
            if (id ){
                const url = 'https://api.mercadopago.com/v1/payments/'+id+'/?acces_token='+process.env.ACCESS_TOKEN
                const payment = await axios.get(url);
            }
        }catch{

        }
    
    }
};

module.exports = {
    getAllProducts,
    createProduct,
    totalProducts,
    deleteProduct,
    buyProduct,
    getProductsByCategory,
    getProductsByName,
    getProductsById,
    getCategories,
    editProduct,
    putReview,
    cartCheckout,
};