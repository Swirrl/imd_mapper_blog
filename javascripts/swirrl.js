// just set up the namespace, and a logger wrapper
window.swirrl = {
  log: function(){
    if(window.console){
      window.console.log( Array.prototype.slice.call(arguments) );
    }
  }
};