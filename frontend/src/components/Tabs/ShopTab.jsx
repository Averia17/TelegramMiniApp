import React, {useEffect, useState} from "react";
import axios from "axios";
import {Box, Button, Snackbar, CircularProgress, Alert} from "@mui/material";


const Product = ({user_id, product}) => {
    const [isLoading, setIsLoading] = useState(false)
    const [openSnackbar, setOpenSnackbar] = useState(false);

    const handleBuy = () => {
        axios.post(
            `${import.meta.env.VITE_BACKEND_URL}/api/products/${product.product_id}/buy`, {user_id: user_id}
        ).then(({data}) => {
            setOpenSnackbar(true);
        }).finally(() => setIsLoading(false))
    }

    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setOpenSnackbar(false);
    };
    return <Box sx={{m: 1}}>
        <div>{product.product_id}</div>
        <div>{product.name}</div>
        <div>{product.description}</div>
        <div>{product.price}</div>
        <Button disabled={isLoading} onClick={handleBuy}>
            Buy
            {isLoading && <CircularProgress sx={{ml: 1}} size={20}/>}
        </Button>
        <Snackbar
            open={openSnackbar}
            autoHideDuration={6000}
            onClose={handleCloseSnackbar}
        >
            <Alert
                onClose={handleCloseSnackbar}
                severity="success"
                sx={{width: '100%'}}
            >
                Purchase successful!
            </Alert>
        </Snackbar>
    </Box>
}

export const ShopTab = ({id}) => {
    const [products, setProducts] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        setIsLoading(true)
        axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/products/`).then(({data}) => {
            setProducts(data)
        }).finally(() => setIsLoading(false))
    }, [])

    return <div>
        <h2>Shop</h2>
        {isLoading ? <CircularProgress size={24}/> :
            products.map((product) => <Product key={product.product_id} user_id={id} product={product}/>)
        }

    </div>
}