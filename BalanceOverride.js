 
const { calculateOnChainBalance } = require('./dist/lib/OnChainBalance'); // il tuo script helper
const WalletBackend = require('./dist/lib/WalletBackend').WalletBackend;

// Sovrascrive getBalance dopo che WalletBackend è stato importato
WalletBackend.prototype.getBalance = async function(subWalletsToTakeFrom) {
    return await calculateOnChainBalance();
};

module.exports = WalletBackend;