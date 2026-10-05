import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App from './App';
import './index.css';

window.React = React;
window.ReactDOMClient = ReactDOMClient;
window.ReactDOM = ReactDOMClient;

ReactDOMClient.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);

